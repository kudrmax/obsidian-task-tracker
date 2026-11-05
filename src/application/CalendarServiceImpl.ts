import { DayBoundary } from "../domain/DayBoundary";
import type { LocalDate } from "../domain/Task";
import { CalendarPolling } from "./CalendarPolling";
import { CalendarChoice, type CalendarKey, keyText } from "./calendarChoice";
import type { CalendarFile } from "./calendarFile";
import { hiddenNow } from "./calendarMigration";
import type {
	CalendarEvent,
	CalendarPoll,
	CalendarService,
	CalendarSource,
	DayEvents,
	DayEventsAsk,
	EventsReason,
	PolledScreen,
	ShownCalendar,
	SourceKind,
	SourceStatus,
	WorkCalendarSetup,
} from "./contracts";
import type { EventFeed, EventFile } from "./EventSource";
import type { Clock, SettingsStore, Timers } from "./ports";

/** Google is fetched by the plugin; the work calendar is a file the iPhone exports. */
const KINDS: Readonly<Record<CalendarSource, SourceKind>> = { google: "synced", iphone: "exported", work: "exported" };

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
/** A feed silent this long counts as failed: its file keeps what it had, and the next refresh asks afresh. */
const ANSWER_TIMEOUT_MS = 15_000;

function localTime(date: LocalDate, plusDays: number, hour: number): Date {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d + plusDays, hour);
}

/** The times a day shows: its timed events from the hour it starts to the next day's, its all-day events by date. */
class DayWindow {
	private readonly timedStart: Date;
	private readonly timedEnd: Date;
	private readonly dateStart: Date;
	private readonly dateEnd: Date;

	constructor(date: LocalDate, boundary: DayBoundary) {
		this.timedStart = localTime(date, 0, boundary.startHour);
		this.timedEnd = localTime(date, 1, boundary.startHour);
		this.dateStart = localTime(date, 0, 0);
		this.dateEnd = localTime(date, 1, 0);
	}

	/** What to choose the events from: both spans. */
	get fetchStart(): Date {
		return this.dateStart;
	}

	get fetchEnd(): Date {
		return this.timedEnd;
	}

	shows(e: CalendarEvent): boolean {
		return e.allDay ? this.touches(e, this.dateStart, this.dateEnd) : this.touches(e, this.timedStart, this.timedEnd);
	}

	private touches(e: CalendarEvent, start: Date, end: Date): boolean {
		const overlaps = e.start < end && e.end > start;
		const startsInside = e.start >= start && e.start < end;
		return overlaps || (e.allDay && startsInside);
	}
}

function answerWithin<T>(answer: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const silence = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`no answer in ${ms / 1000} s`)), ms);
	});
	return Promise.race([answer, silence]).finally(() => clearTimeout(timer));
}

function countMessage(n: number): string {
	return n === 1 ? "1 event" : `${n} events`;
}

function messageOf(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/**
 * The events of a day as the calendars' files hold them: the files are the truth, the feeds only write them. A file
 * that cannot be read, or a feed that failed, keeps the events last read and reports why.
 */
export class CalendarServiceImpl implements CalendarService {
	private readonly lastRead = new Map<CalendarSource, CalendarFile>();
	private readonly fileProblems = new Map<CalendarSource, string>();
	private readonly feedProblems = new Map<CalendarSource, string>();

	constructor(
		private readonly files: readonly EventFile[],
		private readonly feeds: readonly EventFeed[],
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
		private readonly timers: Timers,
		/** Refresh now asks the phone for fresh work events before it fetches. */
		private readonly work: Pick<WorkCalendarSetup, "export">,
		/** Only the phone carries the old choice of calendars over: only there do the phone's and Google's files meet. */
		private readonly migration: { readonly canMigrate: () => boolean },
	) {}

	async known(): Promise<readonly ShownCalendar[]> {
		await this.readFiles();
		const hidden = new Set(this.hidden().map(keyText));
		return this.choice().known().map((c) => ({ account: c.key.account, title: c.key.title, color: c.color, shown: !hidden.has(keyText(c.key)) }));
	}

	async setShown(account: string, title: string, shown: boolean): Promise<void> {
		const others = this.hidden().filter((k) => k.account !== account || k.title !== title);
		await this.settings.update({ hiddenCalendars: shown ? others : [...others, { account, title }], calendarsMigrated: true });
	}

	events(date: LocalDate, reason: EventsReason): DayEventsAsk {
		const cached = this.cached(date);
		if (reason === "refresh") return { cached, fresh: () => this.eventsOn(date) };
		if (reason === "peek" && cached) return { cached, fresh: null };
		return { cached, fresh: () => this.eventsAround(date) };
	}

	keepFresh(screen: PolledScreen): CalendarPoll {
		const polling = new CalendarPolling({
			refresh: () => screen.refresh(),
			intervalMs: () => this.settings.get().google.refreshSeconds * SECOND_MS,
			hidden: () => screen.hidden(),
			now: () => this.clock.now().getTime(),
			timers: this.timers,
		});
		polling.start();
		return {
			wake: () => polling.wake(),
			catchUp: () => polling.catchUp(),
			refreshNow: () => {
				this.work.export();
				return polling.refresh();
			},
			stop: () => polling.stop(),
		};
	}

	onChange(listener: () => void): () => void {
		const offs = this.files.map((f) => f.onChange(listener));
		return () => offs.forEach((off) => off());
	}

	/** Refreshes the feeds, forced, then reads the files. */
	private async eventsOn(date: LocalDate): Promise<DayEvents> {
		await this.refreshFeeds(true);
		await this.readFiles();
		return this.dayOf(date);
	}

	/** The files as they are; a feed due for a refresh runs behind, and its file's change redraws the day. */
	private async eventsAround(date: LocalDate): Promise<DayEvents> {
		void this.refreshFeeds(false);
		await this.readFiles();
		return this.dayOf(date);
	}

	/** Any day from the files as last read, null before the first read. Staleness counts from now: a file written yesterday shows its orange dot today. */
	private cached(date: LocalDate): DayEvents | null {
		return this.lastRead.size === 0 && this.fileProblems.size === 0 ? null : this.dayOf(date);
	}

	private refreshFeeds(force: boolean): Promise<void> {
		return Promise.all(
			this.feeds.map((feed) =>
				answerWithin(feed.refresh(force), ANSWER_TIMEOUT_MS).then(
					() => this.feedProblems.delete(feed.name),
					(e) => this.feedProblems.set(feed.name, messageOf(e)),
				),
			),
		).then(() => undefined);
	}

	private readFiles(): Promise<void> {
		return Promise.all(
			this.files.map((file) =>
				file.read().then(
					(read) => {
						this.lastRead.set(file.name, read);
						this.fileProblems.delete(file.name);
					},
					(e) => this.fileProblems.set(file.name, messageOf(e)),
				),
			),
		).then(() => this.carryOver());
	}

	/** Once, on the phone, when both Google's and the phone's files are there: the old choice becomes the list of hidden calendars. */
	private async carryOver(): Promise<void> {
		if (this.settings.get().calendarsMigrated || !this.migration.canMigrate() || !this.lastRead.has("google") || !this.lastRead.has("iphone")) return;
		await this.settings.update({ hiddenCalendars: this.hidden(), calendarsMigrated: true });
	}

	private choice(hidden: readonly CalendarKey[] = []): CalendarChoice {
		return new CalendarChoice(this.lastRead, hidden, this.settings.get().staleAfterMinutes * MINUTE_MS, this.clock.now());
	}

	private hidden(): CalendarKey[] {
		return hiddenNow(this.settings.get(), this.choice().known(), this.lastRead.get("google"));
	}

	private dayOf(date: LocalDate): DayEvents {
		const window = new DayWindow(date, new DayBoundary(this.settings.get().dayStartHour));
		const chosen = this.choice(this.hidden()).day(window.fetchStart, window.fetchEnd);
		const events = chosen.events.filter((e) => window.shows(e));
		const shown = (name: CalendarSource) => events.filter((e) => e.source === name).length;
		return { events, statuses: this.files.map((f) => this.status(f.name, shown(f.name))), stale: chosen.stale };
	}

	private status(source: CalendarSource, shown: number): SourceStatus {
		const problem = this.fileProblems.get(source) ?? this.feedProblems.get(source) ?? null;
		const file = this.lastRead.get(source);
		const updatedAt = file?.exportedAt ?? null;
		const fed = this.feeds.some((f) => f.name === source);
		return {
			source,
			kind: KINDS[source],
			ok: problem === null,
			message: problem ?? countMessage(shown),
			updatedAt,
			detail: fed ? null : (file?.device ?? null),
			stale: problem !== null || this.isOld(updatedAt),
		};
	}

	private isOld(updatedAt: Date | null): boolean {
		if (updatedAt === null) return true;
		return this.clock.now().getTime() - updatedAt.getTime() > this.settings.get().staleAfterMinutes * MINUTE_MS;
	}
}

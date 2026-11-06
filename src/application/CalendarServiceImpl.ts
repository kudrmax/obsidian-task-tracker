import { dayRelation, type DayRelation } from "../domain/Days";
import type { LocalDate } from "../domain/Task";
import { CalendarPolling } from "./CalendarPolling";
import { type CalendarKey, keyText } from "./calendarChoice";
import type { CalendarFile } from "./calendarFile";
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
	SourceProblem,
	SourceStatus,
	WorkCalendarSetup,
} from "./contracts";
import { type EventFeed, type EventFile, SourceProblemError } from "./EventSource";
import { boundaryOf } from "./documentText";
import type { Clock, SettingsStore, Timers } from "./ports";
import { ShownCalendars } from "./shownCalendars";

/** Google is fetched by the plugin; the work calendar is a file the iPhone exports. */
const KINDS: Readonly<Record<CalendarSource, SourceKind>> = { google: "synced", iphone: "exported", work: "exported" };

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
/** A feed silent this long counts as failed: its file keeps what it had, and the next refresh asks afresh. */
const ANSWER_TIMEOUT_MS = 15_000;

function problemOf(e: unknown): SourceProblem {
	if (e instanceof SourceProblemError) return e.problem;
	return { kind: "failed", detail: e instanceof Error ? e.message : String(e) };
}

/**
 * The events of a day as the calendars' files hold them: the files are the truth, the feeds only write them. A file
 * that cannot be read, or a feed that failed, keeps the events last read and reports why.
 */
export class CalendarServiceImpl implements CalendarService {
	private readonly lastRead = new Map<CalendarSource, CalendarFile>();
	private readonly fileProblems = new Map<CalendarSource, SourceProblem>();
	private readonly feedProblems = new Map<CalendarSource, SourceProblem>();

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
		return this.shown().known().map((c) => ({ account: c.key.account, title: c.key.title, accountName: c.accountName, name: c.name, color: c.color, shown: !hidden.has(keyText(c.key)) }));
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

	isPast(event: CalendarEvent): boolean {
		return event.end.getTime() <= this.clock.now().getTime();
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
				this.answerWithin(feed.refresh(force), ANSWER_TIMEOUT_MS).then(
					() => this.feedProblems.delete(feed.name),
					(e) => this.feedProblems.set(feed.name, problemOf(e)),
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
					(e) => this.fileProblems.set(file.name, problemOf(e)),
				),
			),
		).then(() => this.carryOver());
	}

	/** Once, on the phone, when both Google's and the phone's files are there: the old choice becomes the list of hidden calendars. */
	private async carryOver(): Promise<void> {
		const google = this.lastRead.get("google");
		const withIds = google !== undefined && google.calendars.some((c) => c.calendarId !== null);
		if (this.settings.get().calendarsMigrated || !this.migration.canMigrate() || !withIds || !this.lastRead.has("iphone")) return;
		await this.settings.update({ hiddenCalendars: this.hidden(), calendarsMigrated: true });
	}

	private shown(): ShownCalendars {
		return new ShownCalendars(this.lastRead, this.settings.get(), this.clock.now());
	}

	private hidden(): CalendarKey[] {
		return this.shown().hidden();
	}

	private answerWithin<T>(answer: Promise<T>, ms: number): Promise<T> {
		let timer: number | undefined;
		const silence = new Promise<never>((_, reject) => {
			timer = this.timers.set(() => reject(new SourceProblemError({ kind: "noAnswer", seconds: ms / SECOND_MS }, `no answer in ${ms / SECOND_MS} s`)), ms);
		});
		return Promise.race([answer, silence]).finally(() => {
			if (timer !== undefined) this.timers.clear(timer);
		});
	}

	private dayOf(date: LocalDate): DayEvents {
		const chosen = this.shown().days().day(date);
		const events = chosen.events;
		const shown = (name: CalendarSource) => events.filter((e) => e.source === name).length;
		return {
			events,
			allDay: events.filter((e) => e.allDay),
			timed: events.filter((e) => !e.allDay),
			statuses: this.files.map((f) => this.status(f.name, shown(f.name))),
			stale: chosen.stale,
		};
	}

	private status(source: CalendarSource, shown: number): SourceStatus {
		const problem = this.fileProblems.get(source) ?? this.feedProblems.get(source) ?? null;
		const file = this.lastRead.get(source);
		const updatedAt = file?.exportedAt ?? null;
		const fed = this.feeds.some((f) => f.name === source);
		return {
			source,
			kind: KINDS[source],
			problem,
			events: shown,
			updatedAt,
			updatedDay: updatedAt === null ? null : this.relationOf(updatedAt),
			detail: fed ? null : (file?.device ?? null),
			stale: problem !== null || this.isOld(updatedAt),
		};
	}

	/** How the day `at` falls on stands to today, both by the hour the day starts at. */
	private relationOf(at: Date): DayRelation {
		const boundary = boundaryOf(this.settings.get());
		return dayRelation(boundary.dayOf(at), boundary.dayOf(this.clock.now()));
	}

	private isOld(updatedAt: Date | null): boolean {
		if (updatedAt === null) return true;
		return this.clock.now().getTime() - updatedAt.getTime() > this.settings.get().staleAfterMinutes * MINUTE_MS;
	}
}

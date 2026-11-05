import { DayBoundary } from "../domain/DayBoundary";
import { addDays } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import { CalendarPolling } from "./CalendarPolling";
import type { CalendarEvent, CalendarPoll, CalendarService, CalendarSource, DayEvents, DayEventsAsk, EventsReason, PolledScreen, SourceStatus, WorkCalendarSetup } from "./contracts";
import type { EventBatch, EventSource } from "./EventSource";
import type { Clock, EventCache, SettingsStore, Timers } from "./ports";

interface SourceResult {
	readonly status: SourceStatus;
	readonly events: readonly CalendarEvent[];
}

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
/** A source silent this long counts as failed: its last events stay, marked stale, and the next fetch asks it afresh. */
const ANSWER_TIMEOUT_MS = 15_000;
/** About a month of days opened: the cache stays small, the days around today stay in it. */
const KEPT_DAYS = 31;
/** A day opens with the days next to it, so a swipe finds them ready. */
const AROUND_DAYS = 1;
/** A fetch that brought only a newer time writes the device cache once per this step: after a restart the time shown is at most this old. */
const CACHE_TIME_STEP_MS = 10 * MINUTE_MS;

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

	/** What to ask the sources for: both spans. */
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

/** A source's answer for a fetch: its batch, or why it failed and what it showed before. */
type Answer =
	| { readonly ok: true; readonly batch: EventBatch }
	| { readonly ok: false; readonly message: string };

export class CalendarServiceImpl implements CalendarService {
	private readonly lastGood = new Map<CalendarSource, EventBatch>();
	private days: Map<LocalDate, DayEvents> | null = null;
	/** What the device cache holds since its last write (or its first read): a day is written again only for news. */
	private written = new Map<LocalDate, DayEvents>();
	/** `${source}|${date}`: when a source polled over the network last answered for the day, and under which settings. */
	private readonly answered = new Map<string, { readonly at: number; readonly key: string }>();

	constructor(
		private readonly sources: readonly EventSource[],
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
		private readonly cache: EventCache,
		private readonly timers: Timers,
		/** Refresh now asks the phone for fresh work events before it fetches. */
		private readonly work: Pick<WorkCalendarSetup, "export">,
	) {}

	events(date: LocalDate, reason: EventsReason): DayEventsAsk {
		const cached = this.cached(date);
		if (reason === "refresh") return { cached, fresh: () => this.eventsOn(date) };
		if (reason === "peek" && cached) return { cached, fresh: null };
		return { cached, fresh: () => this.eventsAround(date) };
	}

	/** Fetches both sources afresh for the day alone. */
	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const key = this.answerKey();
		const window = this.windowOf(date);
		const answers = await Promise.all(this.sources.map((s) => this.ask(s, window.fetchStart, window.fetchEnd)));
		const day = this.dayOf(window, answers.map((answer, i) => this.shownBy(this.sources[i], date, window, answer)));
		this.remember([[date, day]]);
		this.noteAnswers([date], answers, key);
		return day;
	}

	/**
	 * The day and the days next to it, one request per source. A source polled over the network that answered for the
	 * day less than the refresh interval ago is not asked again: its last answer is shown.
	 */
	async eventsAround(date: LocalDate): Promise<DayEvents> {
		const key = this.answerKey();
		const dates = [-AROUND_DAYS, 0, AROUND_DAYS].map((n) => addDays(date, n));
		const windows = dates.map((d) => this.windowOf(d));
		const asked = this.sources.map((s) => !this.fresh(s, date));
		if (!asked.some(Boolean)) return this.cached(date)!;
		const answers = await Promise.all(
			this.sources.map((s, i) => (asked[i] ? this.ask(s, windows[0].fetchStart, windows[windows.length - 1].fetchEnd) : Promise.resolve(null))),
		);
		const failed = answers.some((a) => a !== null && !a.ok);
		const dayAt = (n: number): DayEvents | null => {
			const results = answers.map((answer, i) =>
				answer ? this.shownBy(this.sources[i], dates[n], windows[n], answer) : this.keptResult(this.sources[i].name, dates[n]),
			);
			return results.every((r): r is SourceResult => r !== null) ? this.dayOf(windows[n], results) : null;
		};
		// A neighbour is kept only when every source answered for it; the day opened goes last, so it is evicted last.
		const kept: (readonly [LocalDate, DayEvents])[] = [];
		dates.forEach((d, n) => {
			const day = d === date || failed ? null : dayAt(n);
			if (day) kept.push([d, day]);
		});
		const opened = dayAt(dates.indexOf(date));
		if (!opened) return this.eventsOn(date);
		kept.push([date, opened]);
		this.remember(kept);
		this.noteAnswers(kept.map(([d]) => d), answers, key);
		return opened;
	}

	/** The last result for `date` without a fetch; null when none was kept. Staleness counts from now: a day cached yesterday shows its orange dot today. */
	cached(date: LocalDate): DayEvents | null {
		const day = this.lastDay.get(date);
		if (!day) return null;
		return { events: day.events, statuses: day.statuses.map((s) => ({ ...s, stale: !s.ok || this.isOld(s.updatedAt) })) };
	}

	onChange(listener: () => void): () => void {
		const offs = this.sources.flatMap((s) => (s.onChange ? [s.onChange(listener)] : []));
		return () => offs.forEach((off) => off());
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

	/** The device cache, read on first use: a start with the view closed reads nothing. */
	private get lastDay(): Map<LocalDate, DayEvents> {
		if (!this.days) {
			this.days = new Map(this.cache.read());
			this.written = new Map(this.days);
		}
		return this.days;
	}

	private windowOf(date: LocalDate): DayWindow {
		return new DayWindow(date, new DayBoundary(this.settings.get().dayStartHour));
	}

	private async ask(source: EventSource, start: Date, end: Date): Promise<Answer> {
		try {
			const batch = await answerWithin(source.eventsBetween(start, end), ANSWER_TIMEOUT_MS);
			this.lastGood.set(source.name, batch);
			return { ok: true, batch };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : String(e) };
		}
	}

	/** What the source shows on the day: its events in the day's window, or after a failure the day's last ones. */
	private shownBy(source: EventSource, date: LocalDate, window: DayWindow, answer: Answer): SourceResult {
		if (answer.ok) {
			const shown = answer.batch.events.filter((e) => window.shows(e)).length;
			return { events: answer.batch.events, status: this.status(source.name, true, countMessage(shown), answer.batch) };
		}
		const previous = this.keptOf(source.name, date) ?? this.lastGood.get(source.name);
		return { events: previous?.events ?? [], status: this.status(source.name, false, answer.message, previous) };
	}

	/** A source not asked: the day as it last showed it; null when the day has nothing of it. */
	private keptResult(source: CalendarSource, date: LocalDate): SourceResult | null {
		const status = this.cached(date)?.statuses.find((s) => s.source === source);
		const kept = this.keptOf(source, date);
		if (!status || !kept) return null;
		return { events: kept.events, status };
	}

	private dayOf(window: DayWindow, results: readonly SourceResult[]): DayEvents {
		const events = results
			.flatMap((r) => r.events)
			.filter((e) => window.shows(e))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
		return { events, statuses: results.map((r) => r.status) };
	}

	/** The settings a source's answer depends on: an answer given under others is not fresh. */
	private answerKey(): string {
		const { google, dayStartHour } = this.settings.get();
		return JSON.stringify([google.clientId, google.refreshToken, google.calendarIds, dayStartHour]);
	}

	/** Only a source polled over the network can be fresh: one that tells its changes is always asked. */
	private fresh(source: EventSource, date: LocalDate): boolean {
		const refreshSeconds = this.settings.get().google.refreshSeconds;
		if (source.onChange || refreshSeconds <= 0) return false;
		const answer = this.answered.get(`${source.name}|${date}`);
		if (!answer || answer.key !== this.answerKey()) return false;
		return this.clock.now().getTime() - answer.at < refreshSeconds * 1000 && this.keptOf(source.name, date) !== undefined;
	}

	private noteAnswers(dates: readonly LocalDate[], answers: readonly (Answer | null)[], key: string): void {
		const at = this.clock.now().getTime();
		answers.forEach((answer, i) => {
			const source = this.sources[i];
			if (!answer || source.onChange) return;
			if (!answer.ok) {
				for (const id of [...this.answered.keys()]) if (id.startsWith(`${source.name}|`)) this.answered.delete(id);
				return;
			}
			for (const date of dates) this.answered.set(`${source.name}|${date}`, { at, key });
		});
	}

	/** What the day last showed of the source, a restart ago included; undefined when the source never succeeded for it. */
	private keptOf(source: CalendarSource, date: LocalDate): EventBatch | undefined {
		const day = this.lastDay.get(date);
		const status = day?.statuses.find((s) => s.source === source);
		if (!day || !status?.updatedAt) return undefined;
		return { events: day.events.filter((e) => e.source === source), updatedAt: status.updatedAt, detail: status.detail ?? undefined };
	}

	/** Kept in memory always; written to the device only when a day is new, moved, gone or shows something else. */
	private remember(days: readonly (readonly [LocalDate, DayEvents])[]): void {
		const lastDay = this.lastDay;
		for (const [date, day] of days) {
			lastDay.delete(date);
			lastDay.set(date, day);
		}
		for (const oldest of lastDay.keys()) {
			if (lastDay.size <= KEPT_DAYS) break;
			lastDay.delete(oldest);
		}
		if (!this.worthWriting(lastDay)) return;
		this.cache.write(lastDay);
		this.written = new Map(lastDay);
	}

	private worthWriting(days: ReadonlyMap<LocalDate, DayEvents>): boolean {
		if (JSON.stringify([...days.keys()]) !== JSON.stringify([...this.written.keys()])) return true;
		for (const [date, day] of days) {
			const written = this.written.get(date);
			if (!written || newsIn(written, day)) return true;
		}
		return false;
	}

	private status(source: CalendarSource, ok: boolean, message: string, batch: EventBatch | undefined): SourceStatus {
		const updatedAt = batch?.updatedAt ?? null;
		return { source, ok, message, updatedAt, detail: batch?.detail ?? null, stale: !ok || this.isOld(updatedAt) };
	}

	private isOld(updatedAt: Date | null): boolean {
		if (updatedAt === null) return true;
		return this.clock.now().getTime() - updatedAt.getTime() > this.settings.get().staleAfterMinutes * MINUTE_MS;
	}
}

/** Other events or statuses, or a source's update time moved on by more than a step: a fetch that brought only a new time is not written. */
function newsIn(written: DayEvents, day: DayEvents): boolean {
	if (JSON.stringify(written.events) !== JSON.stringify(day.events)) return true;
	const withoutTimes = (d: DayEvents) => JSON.stringify(d.statuses.map(({ updatedAt: _u, stale: _s, ...rest }) => rest));
	if (withoutTimes(written) !== withoutTimes(day)) return true;
	return day.statuses.some((status, i) => {
		const before = written.statuses[i]?.updatedAt ?? null;
		const after = status.updatedAt;
		if (before === null || after === null) return before !== after;
		const moved = after.getTime() - before.getTime();
		return moved < 0 || moved > CACHE_TIME_STEP_MS;
	});
}

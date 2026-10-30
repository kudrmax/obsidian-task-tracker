import { DayBoundary } from "../domain/DayBoundary";
import type { LocalDate } from "../domain/Task";
import type { CalendarEvent, CalendarService, CalendarSource, DayEvents, SourceStatus } from "./contracts";
import type { EventBatch, EventSource } from "./EventSource";
import type { Clock, SettingsStore } from "./ports";

interface SourceResult {
	readonly status: SourceStatus;
	readonly events: readonly CalendarEvent[];
}

const MINUTE_MS = 60_000;

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

function countMessage(n: number): string {
	return n === 1 ? "1 event" : `${n} events`;
}

export class CalendarServiceImpl implements CalendarService {
	private readonly lastGood = new Map<CalendarSource, EventBatch>();
	private readonly lastDay = new Map<LocalDate, DayEvents>();

	constructor(
		private readonly sources: readonly EventSource[],
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
	) {}

	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const window = new DayWindow(date, new DayBoundary(this.settings.get().dayStartHour));
		const results = await Promise.all(this.sources.map((s) => this.fetch(s, window)));
		const events = results
			.flatMap((r) => r.events)
			.filter((e) => window.shows(e))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
		const day: DayEvents = { events, statuses: results.map((r) => r.status) };
		this.lastDay.set(date, day);
		return day;
	}

	cached(date: LocalDate): DayEvents | null {
		return this.lastDay.get(date) ?? null;
	}

	onChange(listener: () => void): () => void {
		const offs = this.sources.flatMap((s) => (s.onChange ? [s.onChange(listener)] : []));
		return () => offs.forEach((off) => off());
	}

	private async fetch(source: EventSource, window: DayWindow): Promise<SourceResult> {
		try {
			const batch = await source.eventsBetween(window.fetchStart, window.fetchEnd);
			this.lastGood.set(source.name, batch);
			const shown = batch.events.filter((e) => window.shows(e)).length;
			return { events: batch.events, status: this.status(source.name, true, countMessage(shown), batch) };
		} catch (e) {
			const previous = this.lastGood.get(source.name);
			const message = e instanceof Error ? e.message : String(e);
			return { events: previous?.events ?? [], status: this.status(source.name, false, message, previous) };
		}
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

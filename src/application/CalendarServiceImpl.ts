import type { LocalDate } from "../domain/Task";
import type { CalendarEvent, CalendarService, CalendarSource, DayEvents, SourceStatus } from "./contracts";
import type { EventBatch, EventSource } from "./EventSource";
import type { Clock, EventCache, SettingsStore } from "./ports";

interface SourceResult {
	readonly status: SourceStatus;
	readonly events: readonly CalendarEvent[];
}

const MINUTE_MS = 60_000;
/** About a month of days opened: the cache stays small, the days around today stay in it. */
const KEPT_DAYS = 31;

function localMidnight(date: LocalDate, plusDays = 0): Date {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d + plusDays);
}

function touchesDay(e: CalendarEvent, dayStart: Date, dayEnd: Date): boolean {
	const overlaps = e.start < dayEnd && e.end > dayStart;
	const startsInside = e.start >= dayStart && e.start < dayEnd;
	return overlaps || (e.allDay && startsInside);
}

function countMessage(n: number): string {
	return n === 1 ? "1 event" : `${n} events`;
}

export class CalendarServiceImpl implements CalendarService {
	private readonly lastGood = new Map<CalendarSource, EventBatch>();
	private readonly lastDay: Map<LocalDate, DayEvents>;

	constructor(
		private readonly sources: readonly EventSource[],
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
		private readonly cache: EventCache,
	) {
		this.lastDay = new Map(cache.read());
	}

	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const dayStart = localMidnight(date);
		const dayEnd = localMidnight(date, 1);
		const results = await Promise.all(this.sources.map((s) => this.fetch(s, date, dayStart, dayEnd)));
		const events = results
			.flatMap((r) => r.events)
			.filter((e) => touchesDay(e, dayStart, dayEnd))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
		const day: DayEvents = { events, statuses: results.map((r) => r.status) };
		this.remember(date, day);
		return day;
	}

	/** Staleness counts from now: a day cached yesterday shows its orange dot today. */
	cached(date: LocalDate): DayEvents | null {
		const day = this.lastDay.get(date);
		if (!day) return null;
		return { events: day.events, statuses: day.statuses.map((s) => ({ ...s, stale: !s.ok || this.isOld(s.updatedAt) })) };
	}

	onChange(listener: () => void): () => void {
		const offs = this.sources.flatMap((s) => (s.onChange ? [s.onChange(listener)] : []));
		return () => offs.forEach((off) => off());
	}

	private async fetch(source: EventSource, date: LocalDate, start: Date, end: Date): Promise<SourceResult> {
		try {
			const batch = await source.eventsBetween(start, end);
			this.lastGood.set(source.name, batch);
			const shown = batch.events.filter((e) => touchesDay(e, start, end)).length;
			return { events: batch.events, status: this.status(source.name, true, countMessage(shown), batch) };
		} catch (e) {
			const previous = this.keptOf(source.name, date) ?? this.lastGood.get(source.name);
			const message = e instanceof Error ? e.message : String(e);
			return { events: previous?.events ?? [], status: this.status(source.name, false, message, previous) };
		}
	}

	/** What the day last showed of the source, a restart ago included; undefined when the source never succeeded for it. */
	private keptOf(source: CalendarSource, date: LocalDate): EventBatch | undefined {
		const day = this.lastDay.get(date);
		const status = day?.statuses.find((s) => s.source === source);
		if (!day || !status?.updatedAt) return undefined;
		return { events: day.events.filter((e) => e.source === source), updatedAt: status.updatedAt, detail: status.detail ?? undefined };
	}

	private remember(date: LocalDate, day: DayEvents): void {
		this.lastDay.delete(date);
		this.lastDay.set(date, day);
		for (const oldest of this.lastDay.keys()) {
			if (this.lastDay.size <= KEPT_DAYS) break;
			this.lastDay.delete(oldest);
		}
		this.cache.write(this.lastDay);
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

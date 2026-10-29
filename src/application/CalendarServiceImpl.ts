import type { LocalDate } from "../domain/Task";
import type { CalendarEvent, CalendarService, CalendarSource, DayEvents, SourceStatus } from "./contracts";
import type { EventBatch, EventSource } from "./EventSource";
import type { Clock, SettingsStore } from "./ports";

interface SourceResult {
	readonly status: SourceStatus;
	readonly events: readonly CalendarEvent[];
}

const MINUTE_MS = 60_000;

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
	private readonly lastDay = new Map<LocalDate, DayEvents>();

	constructor(
		private readonly sources: readonly EventSource[],
		private readonly clock: Clock,
		private readonly settings: SettingsStore,
	) {}

	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const dayStart = localMidnight(date);
		const dayEnd = localMidnight(date, 1);
		const results = await Promise.all(this.sources.map((s) => this.fetch(s, dayStart, dayEnd)));
		const events = results
			.flatMap((r) => r.events)
			.filter((e) => touchesDay(e, dayStart, dayEnd))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
		const day: DayEvents = { events, statuses: results.map((r) => r.status) };
		this.lastDay.set(date, day);
		return day;
	}

	cached(date: LocalDate): DayEvents | null {
		return this.lastDay.get(date) ?? null;
	}

	private async fetch(source: EventSource, start: Date, end: Date): Promise<SourceResult> {
		try {
			const batch = await source.eventsBetween(start, end);
			this.lastGood.set(source.name, batch);
			const shown = batch.events.filter((e) => touchesDay(e, start, end)).length;
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

import type { LocalDate } from "../domain/Task";
import type { CalendarEvent, CalendarService, CalendarSource, DayEvents, SourceStatus } from "./contracts";
import type { EventBatch, EventSource } from "./EventSource";

interface SourceResult {
	readonly status: SourceStatus;
	readonly events: readonly CalendarEvent[];
}

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

	constructor(private readonly sources: readonly EventSource[]) {}

	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const dayStart = localMidnight(date);
		const dayEnd = localMidnight(date, 1);
		const results = await Promise.all(this.sources.map((s) => this.fetch(s, dayStart, dayEnd)));
		const events = results
			.flatMap((r) => r.events)
			.filter((e) => touchesDay(e, dayStart, dayEnd))
			.sort((a, b) => a.start.getTime() - b.start.getTime());
		return { events, statuses: results.map((r) => r.status) };
	}

	private async fetch(source: EventSource, start: Date, end: Date): Promise<SourceResult> {
		try {
			const batch = await source.eventsBetween(start, end);
			this.lastGood.set(source.name, batch);
			const shown = batch.events.filter((e) => touchesDay(e, start, end)).length;
			return {
				events: batch.events,
				status: { source: source.name, ok: true, message: countMessage(shown), updatedAt: batch.updatedAt },
			};
		} catch (e) {
			const previous = this.lastGood.get(source.name);
			const message = e instanceof Error ? e.message : String(e);
			return {
				events: previous?.events ?? [],
				status: { source: source.name, ok: false, message, updatedAt: previous?.updatedAt ?? null },
			};
		}
	}
}

import type { DayBoundary } from "../domain/DayBoundary";
import { addDays } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { CalendarChoice, ChosenDay } from "./calendarChoice";
import type { CalendarEvent } from "./contracts";

function localTime(date: LocalDate, plusDays: number, hour: number): Date {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d + plusDays, hour);
}

/** The times a day shows: its timed events from the hour it starts to the next day's, its all-day events by date. */
class DayWindow {
	readonly timedStart: Date;
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

/**
 * The calendar's days, cut at the day's start: each day's events come from the files the choice takes for that day.
 * The calendar on screen and the phone's meetings both read them here, so they never take a calendar from different files.
 */
export class CalendarDays {
	constructor(
		private readonly choice: CalendarChoice,
		private readonly boundary: DayBoundary,
	) {}

	day(date: LocalDate): ChosenDay {
		const span = new DayWindow(date, this.boundary);
		const chosen = this.choice.day(span.fetchStart, span.fetchEnd);
		return { ...chosen, events: chosen.events.filter((e) => span.shows(e)) };
	}

	/** The timed events that overlap `from`–`to`, each as the day showing it has it, once each, by start. */
	timedBetween(from: Date, to: Date): CalendarEvent[] {
		const found = new Map<string, CalendarEvent>();
		for (let date = this.boundary.dayOf(from); new DayWindow(date, this.boundary).timedStart < to; date = addDays(date, 1)) {
			for (const e of this.day(date).events) {
				if (!e.allDay && e.start < to && e.end > from && !found.has(e.id)) found.set(e.id, e);
			}
		}
		return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
	}
}

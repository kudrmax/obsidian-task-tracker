import { addDays, daysBetween, localDateOf, MINUTES_PER_DAY } from "./LocalDate";
import type { LocalDate, Slot } from "./Task";

const HOUR_MINUTES = 60;
const DAY_HOURS = MINUTES_PER_DAY / HOUR_MINUTES;

/** Minutes from the start of a day; a null `end` is a task at a time, without a duration. */
export interface Span {
	readonly start: number;
	readonly end: number | null;
}

/** The fewest minutes a slot lasts, and a task at a time keeps before its day ends. */
export const MIN_SLOT_MINUTES = 5;

/** The span moved, as long as it is, to lie within its day; one without a duration starts MIN_SLOT_MINUTES before the day ends at the latest. */
export function clampSlot(start: number, end: number | null): Span {
	const duration = end === null ? null : end - start;
	const latest = MINUTES_PER_DAY - (duration ?? MIN_SLOT_MINUTES);
	const moved = Math.min(latest, Math.max(0, start));
	return { start: moved, end: duration === null ? null : moved + duration };
}

/**
 * Where one day ends and the next begins: at `startHour` o'clock, midnight by default. A day is named by the date it
 * starts on, so with the day starting at 4, 1:30 on the 31st still belongs to the 30th. Slots keep the clock's own date
 * and time; the day they belong to is the one their start falls in.
 */
export class DayBoundary {
	static readonly MIDNIGHT = new DayBoundary(0);

	readonly startHour: number;

	constructor(startHour: number) {
		const hour = Math.floor(startHour);
		this.startHour = hour >= 0 && hour < DAY_HOURS ? hour : 0;
	}

	private get startMinute(): number {
		return this.startHour * HOUR_MINUTES;
	}

	dayOf(at: Date): LocalDate {
		return this.dayOfClock(localDateOf(at), at.getHours() * HOUR_MINUTES + at.getMinutes());
	}

	dayOfSlot(slot: Slot): LocalDate {
		return this.dayOfClock(slot.date, slot.start);
	}

	/** Minutes from the start of `day` to `at`; negative before it, past 1440 after it. */
	offsetOf(day: LocalDate, at: Date): number {
		return this.offsetOfClock(day, localDateOf(at), at.getHours() * HOUR_MINUTES + at.getMinutes());
	}

	/** Minutes from the start of `day` to `start` and to `end`, cut at the day's edges: an event that began before it or ends after it. */
	clipToDay(day: LocalDate, start: Date, end: Date): { readonly start: number; readonly end: number } {
		return { start: Math.max(0, this.offsetOf(day, start)), end: Math.min(MINUTES_PER_DAY, this.offsetOf(day, end)) };
	}

	/** Minutes from the start of `day` to the start and the end of `slot`. */
	spanOf(slot: Slot, day: LocalDate): Span {
		const start = this.offsetOfClock(day, slot.date, slot.start);
		return { start, end: slot.end === null ? null : start + slot.end - slot.start };
	}

	/** The slot that takes the minutes from `start` to `end` past the start of `day`, at the clock's date and time. */
	slotAt(day: LocalDate, start: number, end: number | null): Slot {
		const clock = this.startMinute + start;
		const nextDay = clock >= MINUTES_PER_DAY;
		const slotStart = nextDay ? clock - MINUTES_PER_DAY : clock;
		return { date: nextDay ? addDays(day, 1) : day, start: slotStart, end: end === null ? null : slotStart + end - start };
	}

	/** The clock hour the `index`-th hour line of a day stands at. */
	hourAt(index: number): number {
		return (this.startHour + index) % DAY_HOURS;
	}

	/** Minutes from the start of a day to `hour` o'clock in it. */
	offsetOfHour(hour: number): number {
		return ((hour - this.startHour + DAY_HOURS) % DAY_HOURS) * HOUR_MINUTES;
	}

	/** The slot moved and cut to lie within its day and last at least `stepMinutes`; one without a duration starts a step before the day ends. */
	clamp(slot: Slot, stepMinutes: number): Slot {
		const day = this.dayOfClock(slot.date, Math.max(0, slot.start));
		const span = this.spanOf(slot, day);
		if (span.end === null) return this.slotAt(day, Math.max(0, Math.min(span.start, MINUTES_PER_DAY - stepMinutes)), null);
		let { start, end } = span;
		if (start < 0) {
			end -= start;
			start = 0;
		}
		end = Math.min(Math.max(end, stepMinutes), MINUTES_PER_DAY);
		start = Math.max(0, Math.min(start, end - stepMinutes));
		return this.slotAt(day, start, end);
	}

	private dayOfClock(date: LocalDate, minutes: number): LocalDate {
		return minutes < this.startMinute ? addDays(date, -1) : date;
	}

	private offsetOfClock(day: LocalDate, date: LocalDate, minutes: number): number {
		return daysBetween(day, date) * MINUTES_PER_DAY + minutes - this.startMinute;
	}
}

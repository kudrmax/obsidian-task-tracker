import { addDays, daysBetween, localDateOf } from "./LocalDate";
import type { LocalDate, Slot } from "./Task";

const DAY_MINUTES = 1440;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;

export interface Span {
	readonly start: number;
	readonly end: number;
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

	/** Minutes from the start of `day` to the start and the end of `slot`. */
	spanOf(slot: Slot, day: LocalDate): Span {
		const start = this.offsetOfClock(day, slot.date, slot.start);
		return { start, end: start + slot.end - slot.start };
	}

	/** The slot that takes the minutes from `start` to `end` past the start of `day`, at the clock's date and time. */
	slotAt(day: LocalDate, start: number, end: number): Slot {
		const clock = this.startMinute + start;
		const nextDay = clock >= DAY_MINUTES;
		const slotStart = nextDay ? clock - DAY_MINUTES : clock;
		return { date: nextDay ? addDays(day, 1) : day, start: slotStart, end: slotStart + end - start };
	}

	/** The clock hour the `index`-th hour line of a day stands at. */
	hourAt(index: number): number {
		return (this.startHour + index) % DAY_HOURS;
	}

	/** Minutes from the start of a day to `hour` o'clock in it. */
	offsetOfHour(hour: number): number {
		return ((hour - this.startHour + DAY_HOURS) % DAY_HOURS) * HOUR_MINUTES;
	}

	/** The slot moved and cut to lie within its day and last at least `stepMinutes`. */
	clamp(slot: Slot, stepMinutes: number): Slot {
		const day = this.dayOfClock(slot.date, Math.max(0, slot.start));
		let { start, end } = this.spanOf(slot, day);
		if (start < 0) {
			end -= start;
			start = 0;
		}
		end = Math.min(Math.max(end, stepMinutes), DAY_MINUTES);
		start = Math.max(0, Math.min(start, end - stepMinutes));
		return this.slotAt(day, start, end);
	}

	private dayOfClock(date: LocalDate, minutes: number): LocalDate {
		return minutes < this.startMinute ? addDays(date, -1) : date;
	}

	private offsetOfClock(day: LocalDate, date: LocalDate, minutes: number): number {
		return daysBetween(day, date) * DAY_MINUTES + minutes - this.startMinute;
	}
}

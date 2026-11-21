import type { DayBoundary } from "../domain/DayBoundary";
import { addDays, isValidLocalDate, MINUTES_PER_DAY, minutesToHHMM, weekdayOf } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { DaySide } from "./contracts";
import { REPEAT_WORDS } from "./repeatWords";

const DAYS_IN_WEEK = 7;
const HOUR_MINUTES = 60;
const DAY_HOURS = MINUTES_PER_DAY / HOUR_MINUTES;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_RE = /^([+-])(\d{1,4})$/;
const NAMED: Readonly<Record<string, number>> = { today: 0, tomorrow: 1, yesterday: -1 };

/** `count` days from `from` on, `from` first. */
export function daysFrom(from: LocalDate, count: number): readonly LocalDate[] {
	return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => addDays(from, i));
}

/** The week of `today`, or the next one: Monday to Sunday. */
export function weekOf(today: LocalDate, which: "this" | "next"): readonly LocalDate[] {
	const monday = addDays(today, -weekdayOf(today) + (which === "next" ? DAYS_IN_WEEK : 0));
	return daysFrom(monday, DAYS_IN_WEEK);
}

/** The day `text` names from `today`: a date, `today`, `tomorrow`, `yesterday`, `+N`, `-N`; null for anything else. */
export function dayNamed(text: string, today: LocalDate): LocalDate | null {
	const word = text.trim().toLowerCase();
	if (word in NAMED) return addDays(today, NAMED[word]);
	const shift = SHIFT_RE.exec(word);
	if (shift) return addDays(today, (shift[1] === "-" ? -1 : 1) * Number(shift[2]));
	return DATE_RE.test(word) && isValidLocalDate(word) ? word : null;
}

/** The weekday's whole name: `Wednesday`. */
export function weekdayName(date: LocalDate): string {
	return REPEAT_WORDS.weekdays[weekdayOf(date)].name;
}

/** Which side of `today` the day is. */
export function daySide(date: LocalDate, today: LocalDate): DaySide {
	if (date === today) return "today";
	return date < today ? "past" : "future";
}

/** The clock `minute` minutes after the start of a day beginning at `boundary`: `"14:15"`; past midnight from `"00:00"` again. */
export function clockOf(boundary: DayBoundary, minute: number): string {
	const clock = boundary.startHour * HOUR_MINUTES + Math.floor(minute);
	return minutesToHHMM(((clock % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}

/** The labels of a day's hour lines, from the hour it starts at: `"05"`, `"06"`, …, `"04"`. */
export function hourLabels(boundary: DayBoundary): readonly string[] {
	return Array.from({ length: DAY_HOURS }, (_, i) => String(boundary.hourAt(i)).padStart(2, "0"));
}

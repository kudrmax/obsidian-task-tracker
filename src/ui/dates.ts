import type { LocalDate } from "./types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

const two = (n: number) => String(n).padStart(2, "0");

export function localDateOf(d: Date): LocalDate {
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function parseLocalDate(date: LocalDate): Date {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function addDays(date: LocalDate, days: number): LocalDate {
	const d = parseLocalDate(date);
	d.setDate(d.getDate() + days);
	return localDateOf(d);
}

export function dayOfMonth(date: LocalDate): string {
	return String(parseLocalDate(date).getDate());
}

export function monthAbbreviation(date: LocalDate): string {
	return MONTHS[parseLocalDate(date).getMonth()];
}

export function minutesOf(d: Date): number {
	return d.getHours() * MINUTES_PER_HOUR + d.getMinutes();
}

/** `09:00`; past midnight (a slot running into the next date) from the start of that date again. */
export function formatTime(minutes: number): string {
	const clock = minutes > MINUTES_PER_DAY ? minutes - MINUTES_PER_DAY : minutes;
	return `${two(Math.floor(clock / MINUTES_PER_HOUR))}:${two(clock % MINUTES_PER_HOUR)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONDAY = 1;
const DAYS_PER_WEEK = 7;

export function shortWeekday(date: LocalDate): string {
	return WEEKDAYS[parseLocalDate(date).getDay()];
}

/** `3 Nov`. */
export function dayMonth(date: LocalDate): string {
	const d = parseLocalDate(date);
	return `${d.getDate()} ${MONTHS[d.getMonth()][0]}${MONTHS[d.getMonth()].slice(1).toLowerCase()}`;
}

/** `Mon, 2 Nov`. */
export function weekdayDayMonth(date: LocalDate): string {
	return `${shortWeekday(date)}, ${dayMonth(date)}`;
}

/** `November 2026`. */
export function monthTitle(date: LocalDate): string {
	const d = parseLocalDate(date);
	return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** The first Monday after `date`. */
export function nextMonday(date: LocalDate): LocalDate {
	const day = parseLocalDate(date).getDay();
	return addDays(date, ((MONDAY - day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK) + 1);
}

export function startOfMonth(date: LocalDate): LocalDate {
	return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: LocalDate, months: number): LocalDate {
	const d = parseLocalDate(startOfMonth(date));
	d.setMonth(d.getMonth() + months);
	return localDateOf(d);
}

/** The Monday on or before the first of the month. */
export function gridStart(month: LocalDate): LocalDate {
	const first = startOfMonth(month);
	const day = parseLocalDate(first).getDay();
	return addDays(first, -((day - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK));
}

export function sameMonth(a: LocalDate, b: LocalDate): boolean {
	return a.slice(0, 7) === b.slice(0, 7);
}

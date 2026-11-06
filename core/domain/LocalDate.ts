import type { LocalDate } from "./Task";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;
const HOUR_MINUTES = 60;

/** Minutes in a day: the length of the timeline, and the latest a time of day reads. */
export const MINUTES_PER_DAY = 1440;

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function formatUtc(d: Date): LocalDate {
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function localDateOf(d: Date): LocalDate {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** A date of the years 1000–9999 that the calendar has: a month of the year, a day of the month. */
export function isValidLocalDate(s: string): boolean {
	const m = DATE_RE.exec(s);
	if (!m) return false;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function addDays(date: LocalDate, n: number): LocalDate {
	return formatUtc(new Date(utcMs(date) + n * DAY_MS));
}

/** `n` calendar months on, the day of month kept or, when the month is shorter, its last day. */
export function addMonths(date: LocalDate, n: number): LocalDate {
	const { year, month, day } = partsOf(date);
	const index = year * 12 + (month - 1) + n;
	const y = Math.floor(index / 12);
	const m = index - y * 12 + 1;
	return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(Math.min(day, daysInMonth(y, m)))}`;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `month` from 1; a month past either end of the year counts into the next or the last. */
export function daysInMonth(year: number, month: number): number {
	const index = year * 12 + month - 1;
	const y = Math.floor(index / 12);
	const m = index - y * 12;
	return m === 1 && isLeapYear(y) ? 29 : MONTH_DAYS[m];
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: LocalDate): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
	return ((new Date(utcMs(date)).getUTCDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function partsOf(date: LocalDate): { year: number; month: number; day: number } {
	const m = DATE_RE.exec(date);
	if (!m) throw new Error(`Not a date: ${date}`);
	return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
	return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

function utcMs(date: LocalDate): number {
	const m = DATE_RE.exec(date);
	if (!m) throw new Error(`Not a date: ${date}`);
	return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function minutesToHHMM(minutes: number): string {
	return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

export function parseHHMM(s: string): number | null {
	const m = TIME_RE.exec(s);
	if (!m) return null;
	const hours = Number(m[1]);
	const minutes = Number(m[2]);
	if (hours > 24 || minutes > 59) return null;
	const total = hours * HOUR_MINUTES + minutes;
	return total > MINUTES_PER_DAY ? null : total;
}

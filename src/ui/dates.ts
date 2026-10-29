import type { LocalDate } from "./types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MINUTES_PER_HOUR = 60;

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

export function formatTime(minutes: number): string {
	return `${two(Math.floor(minutes / MINUTES_PER_HOUR))}:${two(minutes % MINUTES_PER_HOUR)}`;
}

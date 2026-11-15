import type { LocalDate } from "./answers";

/** A day of the date page's month grid: its number, and whether it is another month's, today, or the one chosen. */
export interface MonthCell {
	readonly date: LocalDate;
	readonly label: string;
	readonly other: boolean;
	readonly today: boolean;
	readonly selected: boolean;
}

export const MONTH_NAMES: ReadonlyMap<number, string> = new Map(
	["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, i) => [i + 1, name] as const),
);

const CELLS = 42;
const two = (n: number) => String(n).padStart(2, "0");

/** A calendar date as the core writes it, of a local date's parts (months from 0, overflowing as `Date` does). */
function dateOf(year: number, month: number, day: number): LocalDate {
	const d = new Date(year, month, day);
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The first of the month `months` after `month`'s (a date of it). */
export function monthAfter(month: LocalDate, months: number): LocalDate {
	return dateOf(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + months, 1);
}

/** The month of `month` as six weeks from the Monday on or before its first: the date page's grid. */
export function monthGrid(month: LocalDate, today: LocalDate, selected: LocalDate | null): readonly MonthCell[] {
	const year = Number(month.slice(0, 4));
	const index = Number(month.slice(5, 7)) - 1;
	const weekday = new Date(year, index, 1).getDay();
	const back = (weekday + 6) % 7;
	const prefix = month.slice(0, 7);
	return Array.from({ length: CELLS }, (_, i) => {
		const date = dateOf(year, index, 1 - back + i);
		return { date, label: String(Number(date.slice(-2))), other: date.slice(0, 7) !== prefix, today: date === today, selected: date === selected };
	});
}

/**
 * The month page's grid (F116, the plugin's `MonthPicker`): six weeks from the Monday on or before the month's first day,
 * each day as `YYYY-MM-DD` with its number and whether it is of another month. Days are written as the port writes them.
 */
export interface MonthCell {
	readonly date: string;
	readonly day: number;
	readonly other: boolean;
}

const CELLS = 42;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const written = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The first of the month `date` (`YYYY-MM-DD`) falls in, `months` months on. */
export function monthOf(date: string, months = 0): string {
	const [year, month] = date.split("-").map(Number);
	return written(new Date(year, month - 1 + months, 1));
}

/** «November 2026». */
export function monthTitle(month: string): string {
	const [year, m] = month.split("-").map(Number);
	return `${MONTH_NAMES[m - 1]} ${year}`;
}

export function monthGrid(month: string): readonly MonthCell[] {
	const [year, m] = month.split("-").map(Number);
	const first = new Date(year, m - 1, 1);
	const back = (first.getDay() + 6) % 7;
	return Array.from({ length: CELLS }, (_, i) => {
		const d = new Date(year, m - 1, 1 - back + i);
		return { date: written(d), day: d.getDate(), other: d.getMonth() !== m - 1 };
	});
}

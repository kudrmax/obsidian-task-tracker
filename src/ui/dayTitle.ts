import { addDays, parseLocalDate } from "./dates";
import type { LocalDate } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Today`, `Tomorrow`, `Yesterday`, or `Tue, 3 Nov`, with the year when it is another year. */
export function dayTitle(date: LocalDate, today: LocalDate): string {
	if (date === today) return "Today";
	if (date === addDays(today, 1)) return "Tomorrow";
	if (date === addDays(today, -1)) return "Yesterday";
	const d = parseLocalDate(date);
	const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
	return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

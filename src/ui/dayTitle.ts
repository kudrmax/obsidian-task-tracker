import type { DayRelation } from "../application/contracts";
import { parseLocalDate } from "./dates";
import type { LocalDate } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORDS: Readonly<Record<Exclude<DayRelation, "other">, string>> = { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" };

/** `Today`, `Tomorrow`, `Yesterday` by how the day stands to today, else `Tue, 3 Nov`, with the year when it is not today's. */
export function dayTitle(date: LocalDate, relation: DayRelation, today: LocalDate): string {
	if (relation !== "other") return WORDS[relation];
	const d = parseLocalDate(date);
	const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
	return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}

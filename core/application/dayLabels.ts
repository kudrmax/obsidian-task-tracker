import type { DayRelation } from "../domain/Days";
import { partsOf, weekdayOf } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORDS: Readonly<Record<Exclude<DayRelation, "other">, string>> = { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" };

/** `Today`, `Tomorrow`, `Yesterday` by how the day stands to today, else `Tue, 3 Nov`, with the year when it is not today's. */
export function dayTitle(date: LocalDate, relation: DayRelation, today: LocalDate): string {
	if (relation !== "other") return WORDS[relation];
	const { year, month, day } = partsOf(date);
	const base = `${WEEKDAYS[weekdayOf(date)]}, ${day} ${MONTHS[month - 1]}`;
	return year === partsOf(today).year ? base : `${base} ${year}`;
}

/** A due date as a card's corner writes it: the day of the month over the month's three letters (`3`, `NOV`). */
export interface DueLabel {
	readonly day: string;
	readonly month: string;
}

/** `3 Nov`: a date as the quick entry's place button and the sources window write it. */
export function dayMonth(date: LocalDate): string {
	const { month, day } = partsOf(date);
	return `${day} ${MONTHS[month - 1]}`;
}

export function dueLabel(date: LocalDate): DueLabel {
	const { month, day } = partsOf(date);
	return { day: String(day), month: MONTHS[month - 1].toUpperCase() };
}

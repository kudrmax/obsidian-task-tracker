import { addDays, dayMonth, nextMonday, shortWeekday, weekdayDayMonth } from "../dates";
import type { LocalDate } from "../types";

export interface DueOption {
	readonly label: string;
	readonly value: LocalDate;
}

export interface DueOptions {
	readonly today: DueOption;
	readonly tomorrow: DueOption;
	readonly nextWeek: DueOption;
	readonly pick: { readonly label: string };
	readonly canRemove: boolean;
}

/** The quick choices of the due date submenu, with the values the board shows beside them. */
export function dueOptions(today: LocalDate, current: LocalDate | null): DueOptions {
	const tomorrow = addDays(today, 1);
	const monday = nextMonday(today);
	return {
		today: { label: shortWeekday(today), value: today },
		tomorrow: { label: shortWeekday(tomorrow), value: tomorrow },
		nextWeek: { label: weekdayDayMonth(monday), value: monday },
		pick: { label: current ? dayMonth(current) : "" },
		canRemove: current !== null,
	};
}

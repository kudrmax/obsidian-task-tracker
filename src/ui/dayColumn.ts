import type { LocalDate } from "./types";

/** What the day column stands for on a day: the list its tasks lie in, the day they get, and whether it shows that list's sections. */
export interface DayColumn {
	readonly list: "now" | "soon";
	/** The day a task written there gets; null for today, which Now gives anyway. */
	readonly date: LocalDate | null;
	readonly sections: boolean;
}

/**
 * The day column on `day` (sections spec §5.1, quick-add spec §4.2): today is Now with its sections; a later day is Soon
 * with that day and Soon's sections; a past day is Now with that day, and shows no sections.
 */
export function dayColumn(day: LocalDate, today: LocalDate): DayColumn {
	if (day === today) return { list: "now", date: null, sections: true };
	return day > today ? { list: "soon", date: day, sections: true } : { list: "now", date: day, sections: false };
}

import type { Placement } from "./Placement";
import type { LocalDate, SectionKey, Slot } from "./Task";

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

/** The placement of a task for `day`: Now for today, else that day. */
export function placementOfDay(day: LocalDate, today: LocalDate): Placement {
	return day === today ? { kind: "now" } : { kind: "date", date: day };
}

/** The day a placement puts a task on: today for Now, the date for a date, none for a list without days. */
export function dayOfPlacement(placement: Placement, today: LocalDate): LocalDate | null {
	if (placement.kind === "now") return today;
	return placement.kind === "date" ? placement.date : null;
}

/** The day a task stands on: its slot's, today for Now, else its due date. `section` is its task's for a subtask. */
export function dayOfTask(section: SectionKey, task: { readonly slot: Slot | null; readonly dueDate: LocalDate | null }, today: LocalDate): LocalDate | null {
	if (task.slot) return task.slot.date;
	return section === "now" ? today : task.dueDate;
}

/** A done task is put off nowhere. */
export function canPostpone(section: SectionKey): boolean {
	return section !== "done";
}

/** A due date can be taken off, except today's: a task for today is in Now by that date. */
export function canRemoveDue(dueDate: LocalDate | null, today: LocalDate): boolean {
	return dueDate !== null && dueDate !== today;
}

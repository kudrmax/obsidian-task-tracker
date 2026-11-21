import type { DayBoundary } from "../domain/DayBoundary";
import { dayOfTask, type TaskScreen, taskScreen } from "../domain/Days";
import type { LocalDate, SectionKey, Slot } from "../domain/Task";

/**
 * Where Max sees a task: Inbox, Backlog, Soon (no date), today, a later (or past) day with its date, or Done. A task dated
 * ahead in the file's Soon is seen only on that day, never in Soon.
 */
export type TaskPlace = { readonly kind: "inbox" | "backlog" | "soon" | "done" } | { readonly kind: "today" | "day"; readonly date: LocalDate };

/** The place of a task's screen (`taskScreen`): a day is today's or another's. */
export function placeOfScreen(screen: TaskScreen, today: LocalDate): TaskPlace {
	if (screen.kind === "list") return { kind: screen.list };
	return { kind: screen.date === today ? "today" : "day", date: screen.date };
}

/** The place of a task in `section` (a subtask's: its task's): Done when closed, else the screen of the day it stands on (`dayOfTask`). */
export function placeOfTask(section: SectionKey, task: { readonly slot: Slot | null; readonly dueDate: LocalDate | null }, open: boolean, today: LocalDate, boundary: DayBoundary): TaskPlace {
	if (!open) return { kind: "done" };
	return placeOfScreen(taskScreen(section, dayOfTask(section, task, today, boundary)), today);
}

/** The funnel's order of places: Inbox, Backlog, Soon, today, then the later days by date. */
export function funnelRank(place: TaskPlace): string {
	const ranks: Readonly<Record<TaskPlace["kind"], string>> = { inbox: "0", backlog: "1", soon: "2", today: "3", day: "4", done: "5" };
	return "date" in place ? `${ranks[place.kind]}${place.date}` : ranks[place.kind];
}

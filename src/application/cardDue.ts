import type { LocalDate } from "../domain/Task";
import type { TaskItem } from "./contracts";

/** What the corner of a task's card shows: its due date, if any, and the repeat icon of a task that repeats. */
export interface CardDue {
	/** Null when the date goes without saying: the card stands on its due day, or the task has none. */
	readonly date: LocalDate | null;
	readonly repeats: boolean;
}

/** The corner of `item`'s card on a column of `day` (null for a list of no day): a due date on that day is left out; null when nothing shows. */
export function cardDue(item: Pick<TaskItem, "dueDate" | "repeat">, day: LocalDate | null): CardDue | null {
	const date = item.dueDate !== null && item.dueDate !== day ? item.dueDate : null;
	const repeats = item.repeat !== null;
	return date === null && !repeats ? null : { date, repeats };
}

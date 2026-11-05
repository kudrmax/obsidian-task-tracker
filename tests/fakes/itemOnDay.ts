import type { TaskItem } from "../../src/application/contracts";
import { canPostpone, canRemoveDue, dayOfTask } from "../../src/domain/Days";
import { canRemind, type LocalDate } from "../../src/domain/Task";

/** A task item as the service reads it on `today`: its day and what may be done to it follow from its fields, unless given. */
export function onDay(item: Omit<TaskItem, "day" | "can"> & Partial<Pick<TaskItem, "day" | "can">>, today: LocalDate): TaskItem {
	return {
		day: dayOfTask(item.list, item, today),
		can: { postpone: canPostpone(item.list), removeDue: canRemoveDue(item.dueDate, today), remind: canRemind(item.slot) },
		...item,
	};
}

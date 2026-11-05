import type { TaskItem } from "../../src/application/contracts";
import { canPostpone, canRemoveDue, dayOfTask } from "../../src/domain/Days";
import { canRemind, type LocalDate } from "../../src/domain/Task";
import { plainText } from "../../src/domain/TaskText";

/** A task item as the service reads it on `today`: its title, its day and what may be done to it follow from its fields, unless given. */
export function onDay(item: Omit<TaskItem, "day" | "can" | "title"> & Partial<Pick<TaskItem, "day" | "can" | "title">>, today: LocalDate): TaskItem {
	return {
		title: plainText(item.text),
		day: dayOfTask(item.list, item, today),
		can: { postpone: canPostpone(item.list), removeDue: canRemoveDue(item.dueDate, today), remind: canRemind(item.slot) },
		...item,
	};
}

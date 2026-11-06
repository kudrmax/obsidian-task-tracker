import type { TaskItem } from "../../src/application/contracts";
import { canPostpone, canRemoveDue, dayOfTask } from "../../src/domain/Days";
import { canRemind, type LocalDate } from "../../src/domain/Task";
import { plainText } from "../../src/domain/TaskText";

/** A task item as the service reads it on `today`: its title, its duration, its day and what may be done to it follow from its fields, unless given; no labels and not collapsed unless given; all its subtasks the open ones unless given. */
export function onDay(item: Omit<TaskItem, "day" | "can" | "title" | "labels" | "collapsed" | "allSubtasks" | "durationMin"> & Partial<Pick<TaskItem, "day" | "can" | "title" | "labels" | "collapsed" | "allSubtasks" | "durationMin">>, today: LocalDate): TaskItem {
	return {
		labels: [],
		collapsed: false,
		allSubtasks: item.subtasks,
		title: plainText(item.text),
		durationMin: item.slot && item.slot.end !== null ? item.slot.end - item.slot.start : null,
		day: dayOfTask(item.list, item, today),
		can: { postpone: canPostpone(item.list), removeDue: canRemoveDue(item.dueDate, today), remind: canRemind(item.slot) },
		...item,
	};
}

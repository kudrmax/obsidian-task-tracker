import type { TaskItem } from "../../src/application/contracts";
import { markColors } from "../../src/application/marks";
import { canPostpone, canRemoveDue, dayOfTask } from "../../src/domain/Days";
import { canRemind, type LocalDate } from "../../src/domain/Task";
import { plainText } from "../../src/domain/TaskText";

/** A task item as the service reads it on `today`: its title, its duration, its day and what may be done to it follow from its fields, unless given; no labels (the colours from the priority and labels given), not collapsed and under no task's key unless given; all its subtasks the open ones unless given. */
export function onDay(item: Omit<TaskItem, "day" | "repeatDay" | "can" | "title" | "labels" | "colors" | "collapsed" | "allSubtasks" | "durationMin" | "parentKey"> & Partial<Pick<TaskItem, "day" | "repeatDay" | "can" | "title" | "labels" | "colors" | "collapsed" | "allSubtasks" | "durationMin" | "parentKey">>, today: LocalDate): TaskItem {
	return {
		labels: [],
		colors: markColors(item.priority, item.labels ?? []),
		collapsed: false,
		parentKey: null,
		allSubtasks: item.subtasks,
		title: plainText(item.text),
		durationMin: item.slot && item.slot.end !== null ? item.slot.end - item.slot.start : null,
		day: dayOfTask(item.list, item, today),
		repeatDay: item.dueDate ?? item.slot?.date ?? today,
		can: { postpone: canPostpone(item.list), removeDue: canRemoveDue(item.dueDate, today), remind: canRemind(item.slot), setPriority: (item.labels ?? []).length === 0, setLabels: item.priority === null, stop: item.repeat !== null && item.repeatable, addDescription: item.description === null, fold: item.subtasks.length > 0, resize: item.slot !== null },
		...item,
	};
}

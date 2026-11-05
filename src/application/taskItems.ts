import { descriptionMarkdown } from "../domain/description";
import type { PriorityLevel } from "../domain/Priority";
import { repeatable } from "../domain/queries";
import { isOpen } from "../domain/Task";
import type { TaskEntry } from "../domain/TaskDocument";
import type { SubtaskProgress, TaskItem } from "./contracts";

/** Of the task's own subtasks, the done ones out of all but those given up. */
function progressOf(entry: TaskEntry): SubtaskProgress | null {
	if (entry.subtasks.length === 0) return null;
	const counted = entry.subtasks.filter((s) => s.task.status !== "cancelled");
	return { done: counted.filter((s) => s.task.status === "done").length, total: counted.length };
}

export function toItem(entry: TaskEntry, levelOf: (prefix: string) => PriorityLevel | null = () => null, parentText: string | null = null): TaskItem {
	return {
		key: { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw },
		text: entry.task.text,
		status: entry.task.status,
		dueDate: entry.task.dueDate,
		slot: entry.task.slot,
		reminder: entry.task.reminder,
		repeat: entry.task.repeat?.rule ?? null,
		open: isOpen(entry.task.status),
		repeatable: repeatable(entry),
		priority: entry.task.priority === null ? null : levelOf(entry.task.priority),
		group: entry.group,
		list: entry.section,
		isSubtask: entry.path.length > 0,
		subtasks: entry.subtasks.filter((sub) => isOpen(sub.task.status)).map((sub) => toItem(sub, levelOf, entry.task.text)),
		progress: progressOf(entry),
		description: descriptionMarkdown(entry),
		parentText,
	};
}

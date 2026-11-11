import { isOpen } from "./Task";
import type { TaskEntry } from "./TaskDocument";

/** The step a task with subtasks shows folded: its first open subtask, then that one's first open subtask, and so on down; null when none is open. */
export function nextStep(entry: TaskEntry): TaskEntry | null {
	let step: TaskEntry | null = null;
	for (let at = entry; ; ) {
		const open = at.subtasks.find((sub) => isOpen(sub.task.status));
		if (!open) return step;
		step = at = open;
	}
}

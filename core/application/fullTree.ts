import type { FullRow, FullTree, TaskItem } from "./contracts";

/** Each subtask with all its own as its subtasks, none folded away: the full screen's list draws every one. */
function unfolded(items: readonly TaskItem[]): TaskItem[] {
	return items.map((item) => ({ ...item, collapsed: false, subtasks: unfolded(item.allSubtasks) }));
}

/** The subtasks in the order the list draws them, each at its depth, a new subtask of each after it and all its own. */
function rowsOf(items: readonly TaskItem[], level: number, rows: FullRow[]): void {
	for (const item of items) {
		const at = rows.length;
		rows.push({ item, level, newSubtask: { index: at + 1, level: level + 1 } });
		rowsOf(item.subtasks, level + 1, rows);
		rows[at] = { ...rows[at], newSubtask: { index: rows.length, level: level + 1 } };
	}
}

export function fullTree(task: TaskItem): FullTree {
	const subtasks = unfolded(task.allSubtasks);
	const rows: FullRow[] = [];
	rowsOf(subtasks, 0, rows);
	return { task, subtasks, rows, newSubtask: { index: rows.length, level: 0 }, project: task.project };
}

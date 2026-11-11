import { GROUPED_LISTS } from "./Lists";
import type { DayBoundary } from "./DayBoundary";
import { dayOf, newTask } from "./operations";
import type { GroupName, LocalDate, Task } from "./Task";
import { flatten, type TaskDocument, type TaskEntry } from "./TaskDocument";


function closedWithRepeat(entry: TaskEntry): boolean {
	return (entry.task.status === "done" || entry.task.status === "cancelled") && entry.task.repeat !== null;
}

/**
 * Spec §3.3: a closed task or subtask with a repeat in Inbox/Backlog/Now/Soon loses its field; its copy goes to the end
 * of Soon as a task of its own, in the section of the same name. A subtask's copy has no parent.
 */
export function recurClosed(doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument {
	if (!doc.hasSection("soon")) return doc;
	for (;;) {
		const entry = GROUPED_LISTS.flatMap((s) => flatten(doc.tasks(s))).find(closedWithRepeat);
		if (!entry) return doc;
		const { task } = entry;
		const copy = newTask(task.text, {
			priority: task.priority,
			labels: task.labels,
			projects: entry.projects,
			children: doc.freshChildren(entry),
			dueDate: task.repeat!.next(dayOf(task, boundary), today),
			repeat: task.repeat,
			collapsed: task.collapsed,
		});
		doc = intoSoon(doc.replace(entry, { ...task, repeat: null }), entry.group, copy);
	}
}

/** The end of Soon's section `name`, made last when Soon has none; the end of the tasks outside any section for null. */
function intoSoon(doc: TaskDocument, name: GroupName, task: Task): TaskDocument {
	if (name === null) return doc.insert("soon", "end", task);
	const groups = doc.groups("soon");
	const index = groups.findIndex((g) => g.index > 0 && g.name === name);
	if (index >= 0) return doc.insert("soon", { endOf: index }, task);
	return doc.addGroup("soon", name, groups.length).insert("soon", { endOf: groups.length }, task);
}

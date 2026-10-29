import type { LocalDate, SectionKey, Task } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

function isOpen(task: Task): boolean {
	return task.status === "todo" || task.status === "inProgress";
}

function erasePastSlots(doc: TaskDocument, today: LocalDate): TaskDocument {
	for (;;) {
		const entry = doc.allTasks().find((e) => isOpen(e.task) && e.task.slot !== null && e.task.slot.date < today);
		if (!entry) return doc;
		doc = doc.replace(entry, { ...entry.task, slot: null });
	}
}

function gatherAtStart(
	doc: TaskDocument,
	target: SectionKey,
	candidate: (e: TaskEntry) => boolean,
): TaskDocument {
	if (!doc.hasSection(target)) return doc;
	let moved = 0;
	for (;;) {
		const entry = doc.allTasks().find((e) => e.section !== target && candidate(e));
		if (!entry) return doc;
		doc = doc.moveEntry(entry, target, moved);
		moved++;
	}
}

function closedToDone(doc: TaskDocument): TaskDocument {
	return gatherAtStart(doc, "done", (e) => !isOpen(e.task));
}

function dueToNow(doc: TaskDocument, today: LocalDate): TaskDocument {
	return gatherAtStart(doc, "now", (e) => {
		if (e.section !== "soon" || !isOpen(e.task)) return false;
		const due = e.task.dueDate !== null && e.task.dueDate <= today;
		const slotted = e.task.slot !== null && e.task.slot.date <= today;
		return due || slotted;
	});
}

export function normalize(doc: TaskDocument, today: LocalDate): TaskDocument {
	const result = dueToNow(closedToDone(erasePastSlots(doc, today)), today);
	return result.serialize() === doc.serialize() ? doc : result;
}

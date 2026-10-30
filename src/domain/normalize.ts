import { DayBoundary } from "./DayBoundary";
import type { LocalDate, SectionKey, Task } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

function isOpen(task: Task): boolean {
	return task.status === "todo" || task.status === "inProgress";
}

function erasePastSlots(doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument {
	for (;;) {
		const entry = doc.allTasks().find((e) => isOpen(e.task) && e.task.slot !== null && boundary.dayOfSlot(e.task.slot) < today);
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

/** An Inbox task that got a due date or a slot is sorted: it goes to Soon, and from there `dueToNow` takes today's on. */
function datedOutOfInbox(doc: TaskDocument): TaskDocument {
	if (!doc.hasSection("soon")) return doc;
	for (;;) {
		const entry = doc.tasks("inbox").find((e) => isOpen(e.task) && (e.task.dueDate !== null || e.task.slot !== null));
		if (!entry) return doc;
		doc = doc.moveEntry(entry, "soon", "end");
	}
}

function dueToNow(doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument {
	return gatherAtStart(doc, "now", (e) => {
		if (e.section !== "soon" || !isOpen(e.task)) return false;
		const due = e.task.dueDate !== null && e.task.dueDate <= today;
		const slotted = e.task.slot !== null && boundary.dayOfSlot(e.task.slot) <= today;
		return due || slotted;
	});
}

export function normalize(doc: TaskDocument, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const result = dueToNow(datedOutOfInbox(closedToDone(erasePastSlots(doc, today, boundary))), today, boundary);
	return result.serialize() === doc.serialize() ? doc : result;
}

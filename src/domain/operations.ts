import type { Placement, TaskDraft } from "../application/contracts";
import { DayBoundary } from "./DayBoundary";
import { STATUS_CHARS, type LocalDate, type SectionKey, type Slot, type Task, type TaskStatus } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

const SLOT_STEP = 5;

export function newTask(text: string, patch: Partial<Task> = {}): Task {
	return { status: "todo", statusChar: STATUS_CHARS.todo, text: text.trim(), dueDate: null, slot: null, children: [], ...patch };
}

function listSection(date: LocalDate, today: LocalDate): SectionKey {
	return date === today ? "now" : "soon";
}

function patch(doc: TaskDocument, entry: TaskEntry, changes: Partial<Task>): TaskDocument {
	return doc.replace(entry, { ...entry.task, ...changes });
}

function sameEntryIn(doc: TaskDocument, entry: TaskEntry): TaskEntry {
	return doc.tasks(entry.section)[entry.index];
}

export function createInList(doc: TaskDocument, date: LocalDate, today: LocalDate, text: string): TaskDocument {
	return date === today ? doc.insert("now", "end", newTask(text)) : doc.insert("soon", "end", newTask(text, { dueDate: date }));
}

export function createInSoon(doc: TaskDocument, text: string): TaskDocument {
	return doc.insert("soon", "end", newTask(text));
}

export function createAtTime(
	doc: TaskDocument,
	date: LocalDate,
	today: LocalDate,
	start: number,
	text: string,
	boundary = DayBoundary.MIDNIGHT,
): TaskDocument {
	const slot = boundary.clamp({ date, start, end: null }, SLOT_STEP);
	return doc.insert(listSection(boundary.dayOfSlot(slot), today), "end", newTask(text, { slot }));
}

export function setStatus(doc: TaskDocument, entry: TaskEntry, status: TaskStatus): TaskDocument {
	return patch(doc, entry, { status, statusChar: STATUS_CHARS[status] });
}

export function setDueDate(doc: TaskDocument, entry: TaskEntry, date: LocalDate | null): TaskDocument {
	return patch(doc, entry, { dueDate: date });
}

export function rename(doc: TaskDocument, entry: TaskEntry, text: string): TaskDocument {
	return patch(doc, entry, { text: text.trim() });
}

export function remove(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return doc.removeEntry(entry);
}

export function moveBefore(
	doc: TaskDocument,
	entry: TaskEntry,
	before: TaskEntry | null,
	date: LocalDate,
	today: LocalDate,
): TaskDocument {
	if (before === null) return doc.moveEntry(entry, listSection(date, today), "end");
	if (before.section === entry.section && before.index === entry.index) return doc;
	return doc.moveEntry(entry, before.section, before.index);
}

export function setSlot(doc: TaskDocument, entry: TaskEntry, slot: Slot, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const clamped = boundary.clamp(slot, SLOT_STEP);
	const slotted = patch(doc, entry, { slot: clamped });
	if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return slotted;
	return slotted.moveEntry(sameEntryIn(slotted, entry), "soon", "end");
}

export function clearSlot(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return patch(doc, entry, { slot: null });
}

export function moveToList(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	return date === today ? doc.moveEntry(entry, "now", "end") : setDueDate(doc, entry, date);
}

export function placementOfEntry(entry: TaskEntry): Placement {
	if (entry.task.dueDate !== null) return { kind: "date", date: entry.task.dueDate };
	if (entry.section === "inbox") return { kind: "inbox" };
	return entry.section === "soon" ? { kind: "soon" } : { kind: "now" };
}

function samePlacement(a: Placement, b: Placement): boolean {
	return a.kind === b.kind && (a.kind !== "date" || b.kind !== "date" || a.date === b.date);
}

function placementTarget(placement: Placement, today: LocalDate): { section: SectionKey; dueDate: LocalDate | null } {
	switch (placement.kind) {
		case "inbox":
			return { section: "inbox", dueDate: null };
		case "soon":
			return { section: "soon", dueDate: null };
		case "now":
			return { section: "now", dueDate: null };
		case "date":
			return { section: placement.date <= today ? "now" : "soon", dueDate: placement.date };
	}
}

/** Inbox is what is not sorted yet: a task placed there loses its slot as well as its due date. */
export function placeTask(doc: TaskDocument, entry: TaskEntry | null, draft: TaskDraft, today: LocalDate, slot?: Slot): TaskDocument {
	const { section, dueDate } = placementTarget(draft.placement, today);
	const unsorted = section === "inbox";
	if (entry === null) return doc.insert(section, "end", newTask(draft.text, { dueDate, slot: unsorted ? null : (slot ?? null) }));
	const edited = patch(doc, entry, { text: draft.text.trim(), dueDate, ...(unsorted ? { slot: null } : {}) });
	if (samePlacement(placementOfEntry(entry), draft.placement) || entry.section === section) return edited;
	return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}

/** The end of Inbox or Soon: a drop on that column from the other one, or at the end of its own. Into Inbox the due date and slot go. */
export function moveToEnd(doc: TaskDocument, entry: TaskEntry, section: "inbox" | "soon"): TaskDocument {
	const prepared = section === "inbox" ? patch(doc, entry, { dueDate: null, slot: null }) : doc;
	return prepared.moveEntry(sameEntryIn(prepared, entry), section, "end");
}

export function moveToSoon(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	return date === today ? doc.moveEntry(entry, "soon", "end") : setDueDate(doc, entry, null);
}

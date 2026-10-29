import type { Placement, TaskDraft } from "../application/contracts";
import { STATUS_CHARS, type LocalDate, type SectionKey, type Slot, type Task, type TaskStatus } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

const DAY_MINUTES = 1440;
const SLOT_STEP = 5;

export function newTask(text: string, patch: Partial<Task> = {}): Task {
	return { status: "todo", statusChar: STATUS_CHARS.todo, text: text.trim(), dueDate: null, slot: null, children: [], ...patch };
}

export function clampSlot(slot: Slot, stepMinutes: number): Slot {
	let { start, end } = slot;
	if (start < 0) {
		end -= start;
		start = 0;
	}
	end = Math.min(Math.max(end, stepMinutes), DAY_MINUTES);
	start = Math.max(0, Math.min(start, end - stepMinutes));
	return { date: slot.date, start, end };
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
	minutes: number,
	text: string,
): TaskDocument {
	const slot: Slot = { date, start, end: Math.min(start + minutes, DAY_MINUTES) };
	return doc.insert(listSection(date, today), "end", newTask(text, { slot }));
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

export function setSlot(doc: TaskDocument, entry: TaskEntry, slot: Slot, today: LocalDate): TaskDocument {
	const clamped = clampSlot(slot, SLOT_STEP);
	const slotted = patch(doc, entry, { slot: clamped });
	if (clamped.date === today || entry.section !== "now") return slotted;
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
	return entry.section === "soon" ? { kind: "soon" } : { kind: "now" };
}

function samePlacement(a: Placement, b: Placement): boolean {
	return a.kind === b.kind && (a.kind !== "date" || b.kind !== "date" || a.date === b.date);
}

function placementTarget(placement: Placement, today: LocalDate): { section: SectionKey; dueDate: LocalDate | null } {
	switch (placement.kind) {
		case "soon":
			return { section: "soon", dueDate: null };
		case "now":
			return { section: "now", dueDate: null };
		case "date":
			return { section: placement.date <= today ? "now" : "soon", dueDate: placement.date };
	}
}

export function placeTask(doc: TaskDocument, entry: TaskEntry | null, draft: TaskDraft, today: LocalDate, slot?: Slot): TaskDocument {
	const { section, dueDate } = placementTarget(draft.placement, today);
	if (entry === null) return doc.insert(section, "end", newTask(draft.text, { dueDate, slot: slot ?? null }));
	const edited = patch(doc, entry, { text: draft.text.trim(), dueDate });
	if (samePlacement(placementOfEntry(entry), draft.placement)) return edited;
	return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}

export function moveToSoon(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	return date === today ? doc.moveEntry(entry, "soon", "end") : setDueDate(doc, entry, null);
}

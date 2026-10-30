import type { Placement, TaskDraft } from "../application/contracts";
import { DayBoundary } from "./DayBoundary";
import { STATUS_CHARS, type LocalDate, type SectionKey, type Slot, type Task, type TaskStatus } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

const SLOT_STEP = 5;

export function newTask(text: string, patch: Partial<Task> = {}): Task {
	return { status: "todo", statusChar: STATUS_CHARS.todo, text: text.trim(), dueDate: null, slot: null, priority: null, children: [], ...patch };
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

/** Now is today: a task put into it takes today's due date. */
function moveInto(doc: TaskDocument, entry: TaskEntry, section: SectionKey, index: number | "end", today: LocalDate): TaskDocument {
	if (section !== "now" || entry.task.dueDate === today) return doc.moveEntry(entry, section, index);
	const dated = patch(doc, entry, { dueDate: today });
	return dated.moveEntry(sameEntryIn(dated, entry), section, index);
}

export function createInList(doc: TaskDocument, date: LocalDate, today: LocalDate, text: string): TaskDocument {
	return doc.insert(listSection(date, today), "end", newTask(text, { dueDate: date }));
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

export function setPriority(doc: TaskDocument, entry: TaskEntry, priority: string | null): TaskDocument {
	return patch(doc, entry, { priority });
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
	if (before === null) return moveInto(doc, entry, listSection(date, today), "end", today);
	if (before.section === entry.section && before.index === entry.index) return doc;
	return moveInto(doc, entry, before.section, before.index, today);
}

export function setSlot(doc: TaskDocument, entry: TaskEntry, slot: Slot, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const clamped = boundary.clamp(slot, SLOT_STEP);
	if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return patch(doc, entry, { slot: clamped });
	const slotted = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
	return slotted.moveEntry(sameEntryIn(slotted, entry), "soon", "end");
}

export function clearSlot(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return patch(doc, entry, { slot: null });
}

export function moveToList(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	return date === today ? moveInto(doc, entry, "now", "end", today) : setDueDate(doc, entry, date);
}

/** Today's due date is the Now tile: Now is today. */
export function placementOfEntry(entry: TaskEntry, today: LocalDate): Placement {
	if (entry.task.dueDate === today) return { kind: "now" };
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
			return { section: "now", dueDate: today };
		case "date":
			return { section: placement.date <= today ? "now" : "soon", dueDate: placement.date };
	}
}

/** Inbox is what is not sorted yet: a task placed there loses its slot as well as its due date. */
export function placeTask(doc: TaskDocument, entry: TaskEntry | null, draft: TaskDraft, today: LocalDate, slot?: Slot): TaskDocument {
	const { section, dueDate } = placementTarget(draft.placement, today);
	const { priority } = draft;
	const unsorted = section === "inbox";
	if (entry === null) return doc.insert(section, "end", newTask(draft.text, { dueDate, slot: unsorted ? null : (slot ?? null), priority }));
	const same = samePlacement(placementOfEntry(entry, today), draft.placement);
	const edited = patch(doc, entry, { text: draft.text.trim(), priority, ...(same ? {} : { dueDate }), ...(unsorted ? { slot: null } : {}) });
	if (same || entry.section === section) return edited;
	return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}

/** The end of Inbox or Soon: a drop on that column from the other one, or at the end of its own. Into Inbox the due date and slot go. */
export function moveToEnd(doc: TaskDocument, entry: TaskEntry, section: "inbox" | "soon"): TaskDocument {
	const prepared = section === "inbox" ? patch(doc, entry, { dueDate: null, slot: null }) : doc;
	return prepared.moveEntry(sameEntryIn(prepared, entry), section, "end");
}

/** The Soon column holds tasks without a date: the task loses it, and today's one also leaves Now for the end of Soon. */
export function moveToSoon(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	const undated = setDueDate(doc, entry, null);
	return date === today ? undated.moveEntry(sameEntryIn(undated, entry), "soon", "end") : undated;
}

/** Put off to `date`: the time goes, and the task waits in Soon for a later day or comes to the end of Now for today. */
export function postpone(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	const postponed = patch(doc, entry, { dueDate: date, slot: null });
	const section: SectionKey = date <= today ? "now" : "soon";
	return entry.section === section ? postponed : postponed.moveEntry(sameEntryIn(postponed, entry), section, "end");
}

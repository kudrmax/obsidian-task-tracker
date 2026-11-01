import type { GroupedList, GroupPlace, Placement, TaskDraft } from "../application/contracts";
import type { GroupSettings } from "../settings";
import { DayBoundary } from "./DayBoundary";
import { STATUS_CHARS, type GroupName, type LocalDate, type SectionKey, type Slot, type Task, type TaskStatus } from "./Task";
import { type InsertPosition, type TaskDocument, type TaskEntry, type TaskGroup, ungroupedIndex } from "./TaskDocument";

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
	return doc.find(entry.section, entry.index, entry.path)!;
}

function samePlace(a: TaskEntry, b: TaskEntry): boolean {
	return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
}

type EntryOperation<A extends unknown[]> = (doc: TaskDocument, entry: TaskEntry, ...rest: A) => TaskDocument;

/** A subtask that goes to another column or the timeline leaves its task first: it becomes the last task of that task's section. */
function leavingItsTask<A extends unknown[]>(operation: EntryOperation<A>): EntryOperation<A> {
	return (doc, entry, ...rest) => {
		if (entry.path.length === 0) return operation(doc, entry, ...rest);
		const moved = doc.moveEntry(entry, entry.section, "end");
		const ungrouped = moved.groups(entry.section)[ungroupedIndex(moved.groups(entry.section))].entries;
		return operation(moved, ungrouped[ungrouped.length - 1], ...rest);
	};
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

function createInSlot(doc: TaskDocument, slot: Slot, text: string, priority: string | null, today: LocalDate, boundary: DayBoundary): TaskDocument {
	const clamped = boundary.clamp(slot, SLOT_STEP);
	return doc.insert(listSection(boundary.dayOfSlot(clamped), today), "end", newTask(text, { slot: clamped, priority }));
}

export function createAtTime(
	doc: TaskDocument,
	date: LocalDate,
	today: LocalDate,
	start: number,
	text: string,
	boundary = DayBoundary.MIDNIGHT,
): TaskDocument {
	return createInSlot(doc, { date, start, end: null }, text, null, today, boundary);
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

/** The description from Markdown: see `TaskDocument.setDescription`. */
export function setDescription(doc: TaskDocument, entry: TaskEntry, markdown: string): TaskDocument {
	return doc.setDescription(entry, markdown);
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
	if (samePlace(before, entry)) return doc;
	return moveInto(doc, entry, before.section, before.index, today);
}

/** Under `parent`, right before its subtask `before` or last, with all the entry's own subtasks. */
export function nest(doc: TaskDocument, entry: TaskEntry, parent: TaskEntry, before: TaskEntry | null): TaskDocument {
	if (before && samePlace(before, entry)) return doc;
	return doc.nestEntry(entry, parent, before);
}

/** The due date a subtask takes from the sheet: none for the place it would have anyway, today's for Now, the day for Date. */
function subtaskDueDate(placement: Placement, inherited: Placement, today: LocalDate): LocalDate | null {
	if (samePlacement(placement, inherited)) return null;
	if (placement.kind === "now") return today;
	return placement.kind === "date" ? placement.date : null;
}

export function createSubtask(doc: TaskDocument, parent: TaskEntry, draft: TaskDraft, today: LocalDate): TaskDocument {
	const dueDate = subtaskDueDate(draft.placement, placementOfEntry(parent, today), today);
	return doc.insertUnder(parent, newTask(draft.text, { dueDate, priority: draft.priority }));
}

function placeOnTimeline(doc: TaskDocument, entry: TaskEntry, slot: Slot, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const clamped = boundary.clamp(slot, SLOT_STEP);
	if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return patch(doc, entry, { slot: clamped });
	const slotted = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
	return slotted.moveEntry(sameEntryIn(slotted, entry), "soon", "end");
}

export function clearSlot(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return patch(doc, entry, { slot: null });
}

function toList(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
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
	if (entry.path.length > 0) return placeSubtask(doc, entry, draft, today);
	const same = samePlacement(placementOfEntry(entry, today), draft.placement);
	const edited = patch(doc, entry, { text: draft.text.trim(), priority, ...(same ? {} : { dueDate }), ...(unsorted ? { slot: null } : {}) });
	if (same || entry.section === section) return edited;
	return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}

/** A subtask stays under its task: another placement only gives it a due date of its own, or takes it away. */
function placeSubtask(doc: TaskDocument, entry: TaskEntry, draft: TaskDraft, today: LocalDate): TaskDocument {
	const current = placementOfEntry(entry, today);
	const dueDate = samePlacement(current, draft.placement) ? entry.task.dueDate : subtaskDueDate(draft.placement, current, today);
	return patch(doc, entry, { text: draft.text.trim(), priority: draft.priority, dueDate });
}

/** The end of Inbox or Soon: a drop on that column from the other one, or at the end of its own. Into Inbox the due date and slot go. */
function toEnd(doc: TaskDocument, entry: TaskEntry, section: "inbox" | "soon"): TaskDocument {
	const prepared = section === "inbox" ? patch(doc, entry, { dueDate: null, slot: null }) : doc;
	return prepared.moveEntry(sameEntryIn(prepared, entry), section, "end");
}

/** The Soon column holds tasks without a date: the task loses it, and today's one also leaves Now for the end of Soon. */
function toSoon(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	const undated = setDueDate(doc, entry, null);
	return date === today ? undated.moveEntry(sameEntryIn(undated, entry), "soon", "end") : undated;
}

/** Put off to `date`: the time goes, and the task waits in Soon for a later day or comes to the end of Now for today. */
function putOff(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	const postponed = patch(doc, entry, { dueDate: date, slot: null });
	const section: SectionKey = date <= today ? "now" : "soon";
	return entry.section === section ? postponed : postponed.moveEntry(sameEntryIn(postponed, entry), section, "end");
}

/** The group of that name in the list, the tasks outside any section for null; -1 when the list has none of the name. */
export function groupIndex(doc: TaskDocument, list: GroupedList, name: GroupName): number {
	const groups = doc.groups(list);
	return name === null ? ungroupedIndex(groups) : groups.findIndex((g) => g.index > 0 && g.name === name);
}

/** The presets that can name a section: not blank, the first of two alike. */
export function usablePresets(presets: readonly string[]): readonly string[] {
	const trimmed = presets.map((p) => p.trim());
	return trimmed.filter((p, i) => p !== "" && trimmed.indexOf(p) === i);
}

/** A new preset section goes after the last preset the list has that comes before it, else before the first that comes after it, else last. */
export function presetPlace(groups: readonly TaskGroup[], name: string, presets: readonly string[]): number {
	const rank = (g: TaskGroup) => (g.index > 0 && g.name !== null ? presets.indexOf(g.name) : -1);
	const own = presets.indexOf(name);
	const earlier = groups.filter((g) => rank(g) >= 0 && rank(g) < own);
	if (earlier.length > 0) return earlier[earlier.length - 1].index + 1;
	const later = groups.find((g) => rank(g) > own);
	return later ? later.index : groups.length;
}

/**
 * What a task takes entering a list: Now is today; Soon and Inbox hold tasks without a slot, Soon on a later day's column
 * with that day as the due date, else with none.
 */
function enteringList(list: GroupedList, today: LocalDate, date: LocalDate | null): Partial<Task> {
	if (list === "now") return { dueDate: today, slot: null };
	return { dueDate: list === "soon" && date !== null && date > today ? date : null, slot: null };
}

/**
 * `before`: a task of `list` the card goes right before; one of another list (a later day's column shows Now's tasks too)
 * puts it at the end of `group`. `date`: the day of the column dropped on.
 */
export function moveToGroup(doc: TaskDocument, entry: TaskEntry, list: GroupedList, group: GroupName, before: TaskEntry | null, today: LocalDate, date: LocalDate | null = null): TaskDocument {
	if (before !== null && entry.path.length === 0 && before.section === entry.section && before.index === entry.index) return doc;
	const entered = patch(doc, entry, enteringList(list, today, date));
	return entered.moveEntry(sameEntryIn(entered, entry), list, positionIn(entered, list, group, before));
}

/** Right before `before` when it is one of `list`'s tasks, else at the end of `group`. */
function positionIn(doc: TaskDocument, list: GroupedList, group: GroupName, before: TaskEntry | null): InsertPosition {
	if (before !== null && before.section === list) return before.index;
	return group === null ? "end" : { endOf: groupIndex(doc, list, group) };
}

/**
 * Where a new task goes: in a list before `before` (one of that list's tasks; else at the end of `group`), as a subtask
 * of `parent` before its subtask `before` or last, or in a time slot. `date`: the day of the column typed in.
 */
export type CreatePlace =
	| { kind: "list"; list: GroupedList; group: GroupName; before: TaskEntry | null; date: LocalDate | null }
	| { kind: "subtask"; parent: TaskEntry; before: TaskEntry | null }
	| { kind: "slot"; slot: Slot };

export function createInPlace(doc: TaskDocument, text: string, priority: string | null, place: CreatePlace, today: LocalDate, boundary: DayBoundary): TaskDocument {
	switch (place.kind) {
		case "subtask":
			return doc.insertUnder(place.parent, newTask(text, { priority }), place.before);
		case "slot":
			return createInSlot(doc, place.slot, text, priority, today, boundary);
		case "list": {
			const { list, group, before } = place;
			const dueDate = list === "now" ? (place.date ?? today) : enteringList(list, today, place.date).dueDate;
			const task = newTask(text, { dueDate, priority });
			return doc.insert(list, positionIn(doc, list, group, before), task);
		}
	}
}

export function createGroup(doc: TaskDocument, entry: TaskEntry, list: GroupedList, name: string, groups: GroupSettings, today: LocalDate, date: LocalDate | null = null): TaskDocument {
	const trimmed = name.trim();
	if (trimmed === "") return doc;
	if (trimmed === groups.ungrouped) return moveToGroup(doc, entry, list, null, null, today, date);
	if (groupIndex(doc, list, trimmed) >= 0) return moveToGroup(doc, entry, list, trimmed, null, today, date);
	const presets = usablePresets(groups.presets);
	const at = presets.includes(trimmed) ? presetPlace(doc.groups(list), trimmed, presets) : doc.groups(list).length;
	const added = doc.addGroup(list, trimmed, at);
	return moveToGroup(added, sameEntryIn(added, entry), list, trimmed, null, today, date);
}

/** A section goes before another one or last; one put above the tasks outside any section pushes them under their heading. */
export function moveGroupTo(doc: TaskDocument, list: GroupedList, group: GroupName, place: GroupPlace): TaskDocument {
	const from = groupIndex(doc, list, group);
	const before = place === "end" ? doc.groups(list).length : groupIndex(doc, list, place.before);
	if (before === from) return doc;
	if (before > 0) return doc.moveGroup(list, from, before);
	const moved = doc.moveGroup(list, from, 1);
	return doc.groups(list)[0].entries.length === 0 ? moved : moved.moveGroup(list, 0, 2);
}

/** A blank or unchanged name does nothing; the No section name hands the tasks over to it; a twin name merges (rule 6). */
export function renameGroup(doc: TaskDocument, list: GroupedList, from: string, to: string, ungrouped: string): TaskDocument {
	const name = to.trim();
	if (name === "" || name === from) return doc;
	if (name === ungrouped) return removeGroup(doc, list, from);
	return doc.renameGroup(list, groupIndex(doc, list, from), name);
}

export function removeGroup(doc: TaskDocument, list: GroupedList, name: string): TaskDocument {
	return doc.mergeGroup(list, groupIndex(doc, list, name), ungroupedIndex(doc.groups(list)), "end");
}

export const setSlot = leavingItsTask(placeOnTimeline);
export const moveToList = leavingItsTask(toList);
export const moveToSoon = leavingItsTask(toSoon);
export const postpone = leavingItsTask(putOff);
export const moveToEnd = leavingItsTask(toEnd);

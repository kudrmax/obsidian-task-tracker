import { DayBoundary, MIN_SLOT_MINUTES } from "./DayBoundary";
import { localDateOf } from "./LocalDate";
import { markChoices, type Marks, marksOf, typedMarks } from "./Marks";
import type { GroupSettings } from "./Groups";
import type { EndList, GroupedList, GroupPlace } from "./Lists";
import type { Placement, TaskDraft } from "./Placement";
import { type Column, columnGroups, columnList } from "./queries";
import { inProject, type ProjectZone } from "./Project";
import { Repeat, type RepeatRule } from "./Repeat";
import { DEFAULT_REMINDER, isOpen, STATUS_CHARS, type GroupName, type LocalDate, type ReminderKind, type SectionKey, type Slot, type Task, type TaskStatus } from "./Task";
import { taskTitle } from "./TaskTitle";
import { type InsertPosition, type TaskDocument, type TaskEntry, type TaskGroup, ungroupedIndex } from "./TaskDocument";

const HOUR_MINUTES = 60;
const MINUTE_MS = 60_000;

export function newTask(text: string, patch: Partial<Task> = {}): Task {
	return { status: "todo", statusChar: STATUS_CHARS.todo, text: taskTitle(text), dueDate: null, slot: null, reminder: DEFAULT_REMINDER, repeat: null, priority: null, labels: [], project: null, collapsed: false, children: [], ...patch };
}

/** The day a task is set for: its due date, else its slot's day. */
export function dayOf(task: Task, boundary: DayBoundary): LocalDate | null {
	return task.dueDate ?? (task.slot ? boundary.dayOfSlot(task.slot) : null);
}

/** The lists whose tasks have neither a due date nor a slot: Inbox, not sorted yet, and Backlog, put off to some day. */
export function isUndated(section: SectionKey): section is "inbox" | "backlog" {
	return section === "inbox" || section === "backlog";
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

function createInSlot(doc: TaskDocument, slot: Slot, text: string, marks: Marks & { readonly project?: string | null }, today: LocalDate, boundary: DayBoundary): TaskDocument {
	const clamped = boundary.clamp(slot, MIN_SLOT_MINUTES);
	return doc.insert(listSection(boundary.dayOfSlot(clamped), today), "end", newTask(text, { slot: clamped, ...marks }));
}

export function createAtTime(
	doc: TaskDocument,
	date: LocalDate,
	today: LocalDate,
	start: number,
	text: string,
	boundary = DayBoundary.MIDNIGHT,
): TaskDocument {
	return createInSlot(doc, { date, start, end: null }, text, marksOf(null, []), today, boundary);
}

export function setStatus(doc: TaskDocument, entry: TaskEntry, status: TaskStatus): TaskDocument {
	return patch(doc, entry, { status, statusChar: STATUS_CHARS[status] });
}

/** A schedule of every few units counts from `date`; any other rule as it is. */
function anchoredRepeat(rule: RepeatRule, date: LocalDate): Repeat {
	return Repeat.of(Repeat.anchored(rule, date));
}

/**
 * Spec §3.5: sets or replaces the rule; a schedule on an undated task gives it `first(today)` and anchors there; on a dated
 * task anchors at its due date, else its slot's day. After done leaves an undated task without a date. Null takes the rule away.
 */
export function setRepeat(doc: TaskDocument, entry: TaskEntry, rule: RepeatRule | null, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	return doc.replace(entry, repeated(entry.task, rule, today, boundary));
}

/** The task with the rule set as `setRepeat` sets it. */
function repeated(task: Task, rule: RepeatRule | null, today: LocalDate, boundary: DayBoundary): Task {
	if (rule === null) return { ...task, repeat: null };
	const day = dayOf(task, boundary);
	if (day !== null) return { ...task, repeat: anchoredRepeat(rule, day) };
	const first = rule.kind === "schedule" ? Repeat.of({ ...rule, every: 1, from: null }).first(today) : null;
	if (first === null) return { ...task, repeat: Repeat.of(rule) };
	return { ...task, repeat: anchoredRepeat(rule, first), dueDate: first };
}

/** The task with `rule` set when there is one. */
function withRepeat(task: Task, rule: RepeatRule | null | undefined, today: LocalDate, boundary: DayBoundary): Task {
	return rule ? repeated(task, rule, today, boundary) : task;
}

/** The draft's rule on the task: none in the draft leaves the task's own. */
function withDraftRepeat(task: Task, draft: TaskDraft, today: LocalDate, boundary: DayBoundary): Task {
	return draft.repeat === undefined ? task : repeated(task, draft.repeat, today, boundary);
}

/** Spec §3.4 Stop: the field goes, the task is done; no copy. */
export function stop(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return patch(doc, entry, { repeat: null, status: "done", statusChar: STATUS_CHARS.done });
}

export function setDueDate(doc: TaskDocument, entry: TaskEntry, date: LocalDate | null): TaskDocument {
	return patch(doc, entry, { dueDate: date });
}

/** The marks a task has: its priority, else its labels; a line written with both has the priority only. */
export function marksOfTask(task: Task): Marks {
	return marksOf(task.priority, task.labels);
}

/** A priority for a task with labels is not set; one set, or taken off, leaves no labels beside it. */
export function setPriority(doc: TaskDocument, entry: TaskEntry, priority: string | null): TaskDocument {
	const marks = marksOfTask(entry.task);
	if (priority !== null && !markChoices(marks).priority) return doc;
	return patch(doc, entry, marksOf(priority, marks.labels));
}

/** The task's labels become `labels`; a task with a priority gets none. */
export function setLabels(doc: TaskDocument, entry: TaskEntry, labels: readonly string[]): TaskDocument {
	if (labels.length > 0 && !markChoices(marksOfTask(entry.task)).labels) return doc;
	return patch(doc, entry, { labels });
}

/** The task's project: the note's link text, null for none. A subtask's is its parent's: its line is left alone. */
export function setProject(doc: TaskDocument, entry: TaskEntry, project: string | null): TaskDocument {
	if (entry.path.length > 0) return doc;
	return patch(doc, entry, { project });
}

export function setReminder(doc: TaskDocument, entry: TaskEntry, reminder: ReminderKind): TaskDocument {
	return patch(doc, entry, { reminder });
}

/**
 * The title as typed: on one line, trimmed, its priority and labels as an edit writes them with the task's own chosen (a
 * typed prefix is the priority of a task without one). The same title and marks give this very document: nothing to write.
 */
export function rename(doc: TaskDocument, entry: TaskEntry, text: string): TaskDocument {
	return patch(doc, entry, typed(doc, text, entry.task.priority, entry.task.labels));
}

/** The circle of a task: an open one is ticked done, a done or given-up one is open again. */
export function toggleDone(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return setStatus(doc, entry, isOpen(entry.task.status) ? "done" : "todo");
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

/** A task with an open subtask may fold its subtasks away; one without has nothing to fold. */
export function hasOpenSubtask(entry: TaskEntry): boolean {
	return entry.subtasks.some((sub) => isOpen(sub.task.status));
}

/** Folds the task's subtasks away, or shows them again; a task without an open subtask stays as it is. */
export function setCollapsed(doc: TaskDocument, entry: TaskEntry, collapsed: boolean): TaskDocument {
	if (collapsed && !hasOpenSubtask(entry)) return doc;
	return patch(doc, entry, { collapsed });
}

/** The tasks the entry sits under show their subtasks, so its card stands on the screen. */
export function unfoldAbove(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	const folded = entry.path.map((_, depth) => doc.find(entry.section, entry.index, entry.path.slice(0, depth))!).filter((above) => above.task.collapsed);
	return doc.replaceAll(folded.map((above) => [above, { ...above.task, collapsed: false }] as const));
}

/**
 * `operation` on the document with `parent` showing its subtasks: a task given a new subtask unfolds, so the subtask is
 * seen. Opening the parent rewrites its line alone, so the entries keep their places.
 */
function intoUnfolded(doc: TaskDocument, parent: TaskEntry, operation: (doc: TaskDocument, same: (entry: TaskEntry) => TaskEntry) => TaskDocument): TaskDocument {
	if (!parent.task.collapsed) return operation(doc, (entry) => entry);
	const opened = patch(doc, parent, { collapsed: false });
	return operation(opened, (entry) => sameEntryIn(opened, entry));
}

/** Under `parent`, right before its subtask `before` or last, with all the entry's own subtasks. */
export function nest(doc: TaskDocument, entry: TaskEntry, parent: TaskEntry, before: TaskEntry | null): TaskDocument {
	if (before && samePlace(before, entry)) return doc;
	return intoUnfolded(doc, parent, (d, same) => d.nestEntry(same(entry), same(parent), before && same(before)));
}

/** The due date a subtask takes from the sheet: none for the place it would have anyway, today's for Now, the day for Date. */
function subtaskDueDate(placement: Placement, inherited: Placement, today: LocalDate): LocalDate | null {
	if (samePlacement(placement, inherited)) return null;
	if (placement.kind === "now") return today;
	return placement.kind === "date" ? placement.date : null;
}

export function createSubtask(doc: TaskDocument, parent: TaskEntry, draft: TaskDraft, today: LocalDate): TaskDocument {
	const dueDate = subtaskDueDate(draft.placement, placementOfEntry(parent, today), today);
	const { text, ...marks } = typed(doc, draft.text, draft.priority, draft.labels ?? []);
	const task = newTask(text, { dueDate, ...marks });
	return intoUnfolded(doc, parent, (d, same) => d.insertUnder(same(parent), task));
}

function placeOnTimeline(doc: TaskDocument, entry: TaskEntry, slot: Slot, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const clamped = boundary.clamp(slot, MIN_SLOT_MINUTES);
	if (boundary.dayOfSlot(clamped) === today || entry.section !== "now") return patch(doc, entry, { slot: clamped });
	const slotted = patch(doc, entry, { slot: clamped, dueDate: entry.task.dueDate === today ? null : entry.task.dueDate });
	return slotted.moveEntry(sameEntryIn(slotted, entry), "soon", "end");
}

export function clearSlot(doc: TaskDocument, entry: TaskEntry): TaskDocument {
	return patch(doc, entry, { slot: null });
}

/** `slot` moved to start `minutes` from `now`, as long as it was: a reminder put off on the phone. */
export function snoozedSlot(slot: Slot, now: Date, minutes: number): Slot {
	const at = new Date(now.getTime() + minutes * MINUTE_MS);
	const start = at.getHours() * HOUR_MINUTES + at.getMinutes();
	return { date: localDateOf(at), start, end: slot.end === null ? null : start + (slot.end - slot.start) };
}

function toList(doc: TaskDocument, entry: TaskEntry, date: LocalDate, today: LocalDate): TaskDocument {
	return date === today ? moveInto(doc, entry, "now", "end", today) : setDueDate(doc, entry, date);
}

/** Today's due date is the Now tile: Now is today. */
export function placementOfEntry(entry: TaskEntry, today: LocalDate): Placement {
	if (entry.task.dueDate === today) return { kind: "now" };
	if (entry.task.dueDate !== null) return { kind: "date", date: entry.task.dueDate };
	if (entry.section === "inbox" || entry.section === "backlog") return { kind: entry.section };
	return entry.section === "soon" ? { kind: "soon" } : { kind: "now" };
}

/** The same place: the same kind, and for a date the same day. */
export function samePlacement(a: Placement, b: Placement): boolean {
	return a.kind === b.kind && (a.kind !== "date" || b.kind !== "date" || a.date === b.date);
}

function placementTarget(placement: Placement, today: LocalDate): { section: SectionKey; dueDate: LocalDate | null } {
	switch (placement.kind) {
		case "inbox":
		case "backlog":
			return { section: placement.kind, dueDate: null };
		case "soon":
			return { section: "soon", dueDate: null };
		case "now":
			return { section: "now", dueDate: today };
		case "date":
			return { section: placement.date <= today ? "now" : "soon", dueDate: placement.date };
	}
}

/** Inbox is what is not sorted yet, Backlog what waits for some day: a task placed in either loses its slot as well as its due date. */
export function placeTask(doc: TaskDocument, entry: TaskEntry | null, draft: TaskDraft, today: LocalDate, slot?: Slot, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const { section, dueDate } = placementTarget(draft.placement, today);
	const unsorted = isUndated(section);
	if (entry === null) {
		const { text, ...marks } = typed(doc, draft.text, draft.priority, draft.labels ?? []);
		return doc.insert(section, "end", withDraftRepeat(newTask(text, { dueDate, slot: unsorted ? null : (slot ?? null), ...marks, project: draft.project ?? null }), draft, today, boundary));
	}
	if (entry.path.length > 0) return placeSubtask(doc, entry, draft, today, boundary);
	const same = samePlacement(placementOfEntry(entry, today), draft.placement);
	const changed = { ...entry.task, ...draftMarks(doc, entry.task, draft), ...(same ? {} : { dueDate }), ...(unsorted ? { slot: null } : {}), ...(draft.project !== undefined && { project: draft.project }) };
	const edited = doc.replace(entry, withDraftRepeat(changed, draft, today, boundary));
	if (same || entry.section === section) return edited;
	return edited.moveEntry(sameEntryIn(edited, entry), section, "end");
}

/** A subtask stays under its task: another placement only gives it a due date of its own, or takes it away. */
function placeSubtask(doc: TaskDocument, entry: TaskEntry, draft: TaskDraft, today: LocalDate, boundary: DayBoundary): TaskDocument {
	const current = placementOfEntry(entry, today);
	const dueDate = samePlacement(current, draft.placement) ? entry.task.dueDate : subtaskDueDate(draft.placement, current, today);
	return doc.replace(entry, withDraftRepeat({ ...entry.task, ...draftMarks(doc, entry.task, draft), dueDate }, draft, today, boundary));
}

/** A title as typed, with the priority and labels chosen for it, as the file is to get it. */
function typed(doc: TaskDocument, text: string, priority: string | null, labels: readonly string[]): Marks & { readonly text: string } {
	const marked = typedMarks(taskTitle(text), priority, labels, doc.priorityPrefixes());
	return { ...marked, text: taskTitle(marked.text) };
}

/** What an edit writes: the draft's text, its priority or the one typed, and its labels, else the task's own, while there is none. */
function draftMarks(doc: TaskDocument, task: Task, draft: TaskDraft): Marks & { readonly text: string } {
	return typed(doc, draft.text, draft.priority, draft.labels ?? task.labels);
}

/** The end of Inbox, Backlog or Soon: a drop on that list from another one, or at the end of its own. Into Inbox and Backlog the due date and slot go. */
function toEnd(doc: TaskDocument, entry: TaskEntry, section: EndList): TaskDocument {
	const prepared = isUndated(section) ? patch(doc, entry, { dueDate: null, slot: null }) : doc;
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
 * What a task takes entering a list: Now is today; Soon, Inbox and Backlog hold tasks without a slot, Soon on a later day's column
 * with that day as the due date, else with none.
 */
function enteringList(list: GroupedList, today: LocalDate, date: LocalDate | null): Partial<Task> {
	if (list === "now") return { dueDate: today, slot: null };
	return { dueDate: list === "soon" && date !== null && date > today ? date : null, slot: null };
}

/**
 * `before`: a task of `list` the card goes right before; one of another list (a later day's column shows Now's tasks too)
 * puts it at the end of `group`. `date`: the day of the column dropped on. `project`, a drop in a project's part of a list
 * (a group of a list grouped by project, or a project's own view): the task becomes that project's (null: none), and with
 * no task to stand before it goes right after the last task of that project the column shows in `group`.
 */
export function moveToGroup(doc: TaskDocument, entry: TaskEntry, list: GroupedList, group: GroupName, before: TaskEntry | null, today: LocalDate, date: LocalDate | null = null, project?: ProjectZone, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	if (before !== null && entry.path.length === 0 && before.section === entry.section && before.index === entry.index && (project === undefined || inProject(entry.project, project))) return doc;
	const entered = patch(doc, entry, enteringList(list, today, date));
	const position = project === undefined || (before !== null && before.section === list) ? positionIn(entered, list, group, before) : afterProject(entered, list, group, project, date, today, boundary, entry);
	return entered.moveEntry(sameEntryIn(entered, entry), list, position, project);
}

/** Right before `before` when it is one of `list`'s tasks, else at the end of `group`. */
function positionIn(doc: TaskDocument, list: GroupedList, group: GroupName, before: TaskEntry | null): InsertPosition {
	if (before !== null && before.section === list) return before.index;
	return group === null ? "end" : { endOf: groupIndex(doc, list, group) };
}

/** The column that shows `list`'s tasks of `date`: Now on today, a later day's for Soon with that day, else the list's own. */
function columnOf(list: GroupedList, date: LocalDate | null, today: LocalDate): Column {
	if (list === "now") return { kind: "day", date: today };
	if (list === "soon" && date !== null && date > today) return { kind: "day", date };
	return { kind: list };
}

/**
 * Right after the last task of `project` the column of `list` and `date` shows in `group`, `moving` aside; the end of
 * `group` when it shows none.
 */
function afterProject(doc: TaskDocument, list: GroupedList, group: GroupName, project: ProjectZone, date: LocalDate | null, today: LocalDate, boundary: DayBoundary, moving: TaskEntry | null): InsertPosition {
	const shown = columnGroups(doc, columnOf(list, date, today), today, boundary).find((g) => g.name === group)?.entries ?? [];
	const ours = shown.filter((e) => e.section === list && inProject(e.project, project) && !(moving && moving.path.length === 0 && samePlace(e, moving)));
	const last = ours[ours.length - 1];
	if (!last) return positionIn(doc, list, group, null);
	const own = doc.groups(list).find((g) => g.entries.includes(last))!;
	const next = own.entries[own.entries.indexOf(last) + 1];
	return next ? next.index : { endOf: own.index };
}

/**
 * Where a new task goes: in a list before `before` (one of that list's tasks; else at the end of `group`), as a subtask
 * of `parent` before its subtask `before` or last, or in a time slot. `date`: the day of the column typed in.
 */
export type CreatePlace =
	| { kind: "list"; list: GroupedList; group: GroupName; before: TaskEntry | null; date: LocalDate | null; project?: ProjectZone; section?: string }
	| { kind: "subtask"; parent: TaskEntry; before: TaskEntry | null }
	| { kind: "slot"; slot: Slot; project?: ProjectZone };

/**
 * A new task at `place`; `repeat` is set as `setRepeat` sets it, on a task or a subtask; a slot takes none. A priority,
 * chosen or typed, or `labels`: not both. `own`, the task's project whatever the place's (which then only places it); a
 * subtask takes none.
 */
export function createInPlace(doc: TaskDocument, typedText: string, priority: string | null, place: CreatePlace, today: LocalDate, boundary: DayBoundary, repeat?: RepeatRule | null, labels: readonly string[] = [], own?: string | null): TaskDocument {
	const { text, ...marks } = typed(doc, typedText, priority, labels);
	const projectOf = (zone: ProjectZone | undefined): string | null => (own !== undefined ? own : (zone ?? null));
	switch (place.kind) {
		case "subtask":
			return intoUnfolded(doc, place.parent, (d, same) =>
				d.insertUnder(same(place.parent), withRepeat(newTask(text, marks), repeat, today, boundary), place.before && same(place.before)),
			);
		case "slot":
			return createInSlot(doc, place.slot, text, { ...marks, project: projectOf(place.project) }, today, boundary);
		case "list": {
			const { list, before, project } = place;
			const dueDate = list === "now" ? (place.date ?? today) : enteringList(list, today, place.date).dueDate;
			const task = withRepeat(newTask(text, { dueDate, ...marks, project: projectOf(project) }), repeat, today, boundary);
			if (place.section !== undefined) return intoNewSection(doc, list, place.group, place.section, task, place.date, today, boundary, project ?? null);
			const position = project === undefined || (before !== null && before.section === list) ? positionIn(doc, list, place.group, before) : afterProject(doc, list, place.group, project, place.date, today, boundary, null);
			return doc.insert(list, position, task);
		}
	}
}

/**
 * A task written with a section named for it, from a project's part of a list (an empty section is not made there): into
 * `name` after the project's last task there when the list has it, else under a new `### name` right after `group`.
 */
function intoNewSection(doc: TaskDocument, list: GroupedList, group: GroupName, name: string, task: Task, date: LocalDate | null, today: LocalDate, boundary: DayBoundary, project: ProjectZone): TaskDocument {
	const index = groupIndex(doc, list, name);
	if (index >= 0) return doc.insert(list, afterProject(doc, list, name, project, date, today, boundary, null), task);
	const at = Math.max(1, groupIndex(doc, list, group) + 1);
	return doc.addGroup(list, name, at).insert(list, { endOf: at }, task);
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

/**
 * The quick-entry field switched to a section, at `before` in `group` of the column, or at its end (empty sections spec §4):
 * the tasks the column shows from `before` to the group's end go into `### name`, written right after the group; those it
 * hides stay. A blank name, the No section name, the group's own name or a past day changes nothing; a name the list has
 * takes the tasks to the end of that section. Another list's tasks (Now's on a later day) enter it first.
 */
export function createSection(doc: TaskDocument, column: Column, group: GroupName, before: TaskEntry | null, name: string, groups: GroupSettings, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const list = columnList(column, today);
	const trimmed = name.trim();
	if (list === null || trimmed === "" || trimmed === groups.ungrouped || trimmed === group) return doc;
	const shown = columnGroups(doc, column, today, boundary).find((g) => g.name === group)?.entries ?? [];
	const at = before === null ? shown.length : shown.findIndex((e) => samePlace(e, before));
	if (at < 0) throw new Error(`Not a task the column shows in its group: ${before!.raw}`);
	const below = shown.slice(at);
	const own = below.filter((e) => e.section === list);
	const index = groupIndex(doc, list, group);
	const twin = groupIndex(doc, list, trimmed) >= 0;
	if (twin && below.length === 0) return doc;
	let split = doc.splitGroup(list, index, trimmed, own);
	if (twin) split = split.mergeGroup(list, index + 1, split.groups(list).findIndex((g) => g.index > 0 && g.index !== index + 1 && g.name === trimmed), "end");
	const date = column.kind === "day" ? column.date : null;
	return below
		.filter((e) => e.section !== list)
		.reduce((current, entry, i) => {
			const target = current.groups(list)[groupIndex(current, list, trimmed)].entries;
			const first = own.length > 0 ? target[target.length - own.length] : null;
			return moveToGroup(current, current.tasks(entry.section)[entry.index - i], list, trimmed, first, today, date);
		}, split);
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

/**
 * Rename inside a project's part of a list: that project's tasks of section `from`, in order, go to the end of section
 * `to`, made where `from` stands when the list lacks it; the others stay. The No section name takes them out as
 * `removeGroupIn`; a blank or unchanged name does nothing.
 */
export function renameGroupIn(doc: TaskDocument, list: GroupedList, from: string, to: string, ungrouped: string, project: ProjectZone): TaskDocument {
	const name = to.trim();
	if (name === "" || name === from) return doc;
	if (name === ungrouped) return removeGroupIn(doc, list, from, project);
	if (!doc.groups(list)[groupIndex(doc, list, from)]?.entries.some((e) => inProject(e.project, project))) return doc;
	const made = groupIndex(doc, list, name) >= 0 ? doc : doc.addGroup(list, name, groupIndex(doc, list, from));
	return projectOut(made, list, from, project, (d) => ({ endOf: groupIndex(d, list, name) }));
}

/** Remove section inside a project's part: that project's tasks of the section join the end of No section; the others stay. */
export function removeGroupIn(doc: TaskDocument, list: GroupedList, name: string, project: ProjectZone): TaskDocument {
	return projectOut(doc, list, name, project, () => "end");
}

/** Each task of `project` in section `name`, in order, to `to`; the section goes once it is left with nothing. */
function projectOut(doc: TaskDocument, list: GroupedList, name: string, project: ProjectZone, to: (doc: TaskDocument) => InsertPosition): TaskDocument {
	for (;;) {
		const index = groupIndex(doc, list, name);
		const entry = index < 0 ? undefined : doc.groups(list)[index].entries.find((e) => inProject(e.project, project));
		if (!entry) return doc;
		doc = doc.moveEntry(entry, list, to(doc));
	}
}

export function removeGroup(doc: TaskDocument, list: GroupedList, name: string): TaskDocument {
	return doc.mergeGroup(list, groupIndex(doc, list, name), ungroupedIndex(doc.groups(list)), "end");
}

export const setSlot = leavingItsTask(placeOnTimeline);
export const moveToList = leavingItsTask(toList);
export const moveToSoon = leavingItsTask(toSoon);
export const postpone = leavingItsTask(putOff);
export const moveToEnd = leavingItsTask(toEnd);

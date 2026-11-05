import { DayBoundary } from "./DayBoundary";
import { dayColumn } from "./Days";
import type { GroupedList } from "./Lists";
import { isOpen, type GroupName, type LocalDate } from "./Task";
import { type TaskDocument, type TaskEntry, ungroupedIndex } from "./TaskDocument";

function slottedOnDate(entry: TaskEntry, date: LocalDate, boundary: DayBoundary): boolean {
	return entry.task.slot !== null && boundary.dayOfSlot(entry.task.slot) === date;
}

function listed(doc: TaskDocument): readonly TaskEntry[] {
	return [...doc.tasks("now"), ...doc.tasks("soon")];
}

/** The Day column: today it is Now, another day D the tasks of Now and Soon due on D. Slotted ones are on the timeline. */
export function dayList(doc: TaskDocument, date: LocalDate, today: LocalDate, boundary = DayBoundary.MIDNIGHT): readonly TaskEntry[] {
	const shown = (e: TaskEntry): boolean =>
		date === today ? e.section === "now" || e.task.dueDate === date : e.task.dueDate === date;
	return listed(doc).filter((e) => shown(e) && !slottedOnDate(e, date, boundary));
}

export function slottedOn(doc: TaskDocument, date: LocalDate, boundary = DayBoundary.MIDNIGHT): readonly TaskEntry[] {
	return listed(doc).filter((e) => slottedOnDate(e, date, boundary));
}

/** Unfinished tasks of Now and Soon that are put on a time, on any day. */
export function openSlotted(doc: TaskDocument): readonly TaskEntry[] {
	return listed(doc).filter((e) => e.task.slot !== null && isOpen(e.task.status));
}

/** The Soon column: Soon is everything not for today, and the column shows the part of it without a date. */
export function soonWithoutDate(doc: TaskDocument): readonly TaskEntry[] {
	return doc.tasks("soon").filter((e) => e.task.dueDate === null && e.task.slot === null);
}

export function inboxList(doc: TaskDocument): readonly TaskEntry[] {
	return doc.tasks("inbox");
}

export function backlogList(doc: TaskDocument): readonly TaskEntry[] {
	return doc.tasks("backlog");
}

/** An open task of its own may repeat; a subtask goes with its parent, and a closed task repeats no more. */
export function repeatable(entry: TaskEntry): boolean {
	return entry.path.length === 0 && isOpen(entry.task.status);
}

/** A column that shows a list's sections: Inbox, Backlog, Soon without a date, or the day column on `date`. */
export type Column = { readonly kind: "inbox" | "backlog" | "soon" } | { readonly kind: "day"; readonly date: LocalDate };

/** A group of a list as a column shows it: the tasks of its own it shows, in screen order. */
export interface ColumnGroup {
	readonly list: GroupedList;
	/** Its place among the list's groups. */
	readonly index: number;
	readonly name: GroupName;
	readonly entries: readonly TaskEntry[];
}

/** The list whose sections the column shows; null for a past day, which shows none. */
export function columnList(column: Column, today: LocalDate): GroupedList | null {
	if (column.kind !== "day") return column.kind;
	const day = dayColumn(column.date, today);
	return day.sections ? day.list : null;
}

/**
 * The column's groups in screen order (empty sections spec §5.1): those with tasks the column shows, and the empty
 * sections of its list, with no task in the file. The tasks of another list (Now's on a later day) lead No section.
 */
export function columnGroups(doc: TaskDocument, column: Column, today: LocalDate, boundary = DayBoundary.MIDNIGHT): readonly ColumnGroup[] {
	const list = columnList(column, today);
	if (list === null) return [];
	const shown = column.kind === "day" ? dayList(doc, column.date, today, boundary) : column.kind === "soon" ? soonWithoutDate(doc) : doc.tasks(list);
	const groups = doc.groups(list);
	const ungrouped = ungroupedIndex(groups);
	const others = shown.filter((e) => e.section !== list);
	return groups
		.map((g) => ({ list, index: g.index, name: g.name, entries: [...(g.index === ungrouped ? others : []), ...shown.filter((e) => e.section === list && g.entries.includes(e))] }))
		.filter((g, i) => g.entries.length > 0 || (groups[i].heading && g.name !== null && groups[i].entries.length === 0));
}

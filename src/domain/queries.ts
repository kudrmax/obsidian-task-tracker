import type { SubtaskProgress, TaskItem } from "../application/contracts";
import type { PriorityLevel } from "../settings";
import { DayBoundary } from "./DayBoundary";
import { descriptionMarkdown } from "./description";
import type { LocalDate } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

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
	return listed(doc).filter((e) => e.task.slot !== null && e.task.status !== "done" && e.task.status !== "cancelled");
}

/** The Soon column: Soon is everything not for today, and the column shows the part of it without a date. */
export function soonWithoutDate(doc: TaskDocument): readonly TaskEntry[] {
	return doc.tasks("soon").filter((e) => e.task.dueDate === null && e.task.slot === null);
}

export function inboxList(doc: TaskDocument): readonly TaskEntry[] {
	return doc.tasks("inbox");
}

function isOpen(entry: TaskEntry): boolean {
	return entry.task.status === "todo" || entry.task.status === "inProgress";
}

/** Of the task's own subtasks, the done ones out of all but those given up. */
function progressOf(entry: TaskEntry): SubtaskProgress | null {
	if (entry.subtasks.length === 0) return null;
	const counted = entry.subtasks.filter((s) => s.task.status !== "cancelled");
	return { done: counted.filter((s) => s.task.status === "done").length, total: counted.length };
}

export function toItem(entry: TaskEntry, levelOf: (prefix: string) => PriorityLevel | null = () => null, parentText: string | null = null): TaskItem {
	return {
		key: { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw },
		text: entry.task.text,
		status: entry.task.status,
		dueDate: entry.task.dueDate,
		slot: entry.task.slot,
		priority: entry.task.priority === null ? null : levelOf(entry.task.priority),
		group: entry.group,
		subtasks: entry.subtasks.filter(isOpen).map((sub) => toItem(sub, levelOf, entry.task.text)),
		progress: progressOf(entry),
		description: descriptionMarkdown(entry),
		parentText,
	};
}

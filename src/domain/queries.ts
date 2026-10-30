import type { TaskItem } from "../application/contracts";
import { DayBoundary } from "./DayBoundary";
import type { LocalDate } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

function slottedOnDate(entry: TaskEntry, date: LocalDate, boundary: DayBoundary): boolean {
	return entry.task.slot !== null && boundary.dayOfSlot(entry.task.slot) === date;
}

function listed(doc: TaskDocument): readonly TaskEntry[] {
	return [...doc.tasks("now"), ...doc.tasks("soon")];
}

export function listOn(doc: TaskDocument, date: LocalDate, today: LocalDate, boundary = DayBoundary.MIDNIGHT): readonly TaskEntry[] {
	const shown = (e: TaskEntry): boolean =>
		date === today ? e.section === "now" || e.task.dueDate === date : e.task.dueDate === date;
	return listed(doc).filter((e) => shown(e) && !slottedOnDate(e, date, boundary));
}

export function slottedOn(doc: TaskDocument, date: LocalDate, boundary = DayBoundary.MIDNIGHT): readonly TaskEntry[] {
	return listed(doc).filter((e) => slottedOnDate(e, date, boundary));
}

export function soonList(doc: TaskDocument): readonly TaskEntry[] {
	return doc.tasks("soon").filter((e) => e.task.dueDate === null && e.task.slot === null);
}

export function toItem(entry: TaskEntry): TaskItem {
	return {
		key: { section: entry.section, index: entry.index, raw: entry.raw },
		text: entry.task.text,
		status: entry.task.status,
		dueDate: entry.task.dueDate,
		slot: entry.task.slot,
	};
}

import type { Repeat } from "./Repeat";

/** A calendar day as `YYYY-MM-DD`. Compared as strings. */
export type LocalDate = string;

/** Which of the plugin's sections a task sits in. */
export type SectionKey = "inbox" | "backlog" | "now" | "soon" | "done";

/** A `###` section of a list by its name, or null for the tasks outside any. */
export type GroupName = string | null;

/** `[ ]`, `[/]`, `[x]`, `[-]`. Any other character reads as todo and is written back unchanged. */
export type TaskStatus = "todo" | "inProgress" | "done" | "cancelled";

/** Not done and not given up: todo or in progress. */
export function isOpen(status: TaskStatus): boolean {
	return status === "todo" || status === "inProgress";
}

/** In progress, unless every task already is: then back to todo. One task's is `[its status]`. */
export function nextProgress(statuses: readonly TaskStatus[]): TaskStatus {
	return statuses.every((status) => status === "inProgress") ? "todo" : "inProgress";
}

/**
 * Minutes of the day on `date`'s clock, `start` below 1440. `end` may equal 1440 (midnight) or pass it: the slot runs
 * into the next date. A null `end` is a task at a time, without a duration.
 */
export interface Slot {
	readonly date: LocalDate;
	readonly start: number;
	readonly end: number | null;
}

/** What the time of a task does on the phone: a quiet notification, an alarm, or nothing. Read from the marker before the slot. */
export type ReminderKind = "notification" | "alarm" | "none";

/** The order a reminder's kind goes round in. */
export const REMINDER_KINDS: readonly ReminderKind[] = ["notification", "alarm", "none"];

/** The kind after `kind`, round. */
export function nextReminder(kind: ReminderKind): ReminderKind {
	return REMINDER_KINDS[(REMINDER_KINDS.indexOf(kind) + 1) % REMINDER_KINDS.length];
}

/** Only a task on a time reminds: one without a slot keeps its kind for when it gets one. */
export function canRemind(slot: Slot | null): boolean {
	return slot !== null;
}

export interface Task {
	readonly status: TaskStatus;
	/** The character between the brackets as read, so an unknown one survives a rewrite. */
	readonly statusChar: string;
	/** Task text without the due date and slot fields, trimmed. */
	readonly text: string;
	readonly dueDate: LocalDate | null;
	readonly slot: Slot | null;
	/** Kept without a slot too, so a task put on a time again gets its kind back. */
	readonly reminder: ReminderKind;
	/** The rule after the repeat marker; null for a task that does not repeat. */
	readonly repeat: Repeat | null;
	/** The prefix of a priority level, the first word of the line's text; null without one. */
	readonly priority: string | null;
	/** Nested lines (deeper indent than the task), raw, in file order. They travel with the task. */
	readonly children: readonly string[];
}

export const STATUS_CHARS: Readonly<Record<TaskStatus, string>> = {
	todo: " ",
	inProgress: "/",
	done: "x",
	cancelled: "-",
};

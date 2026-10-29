/** A calendar day as `YYYY-MM-DD`. Compared as strings. */
export type LocalDate = string;

/** Which of the plugin's sections a task sits in. Inbox and Backlog are never read. */
export type SectionKey = "now" | "soon" | "done";

/** `[ ]`, `[/]`, `[x]`, `[-]`. Any other character reads as todo and is written back unchanged. */
export type TaskStatus = "todo" | "inProgress" | "done" | "cancelled";

/** Minutes of the day, 0..1440. `end` may equal 1440 (midnight). */
export interface Slot {
	readonly date: LocalDate;
	readonly start: number;
	readonly end: number;
}

export interface Task {
	readonly status: TaskStatus;
	/** The character between the brackets as read, so an unknown one survives a rewrite. */
	readonly statusChar: string;
	/** Task text without the due date and slot fields, trimmed. */
	readonly text: string;
	readonly dueDate: LocalDate | null;
	readonly slot: Slot | null;
	/** Nested lines (deeper indent than the task), raw, in file order. They travel with the task. */
	readonly children: readonly string[];
}

export const STATUS_CHARS: Readonly<Record<TaskStatus, string>> = {
	todo: " ",
	inProgress: "/",
	done: "x",
	cancelled: "-",
};

import type { RepeatRule } from "./Repeat";
import type { LocalDate } from "./Task";

/**
 * Where the task sheet puts a task: Inbox = section Inbox without a due date or slot, Backlog = section Backlog likewise,
 * Soon = section Soon without a due date, Now = section Now with today's due date (Now is today), Date = a due date.
 */
export type Placement =
	| { readonly kind: "inbox" }
	| { readonly kind: "backlog" }
	| { readonly kind: "soon" }
	| { readonly kind: "now" }
	| { readonly kind: "date"; readonly date: LocalDate };

export interface TaskDraft {
	readonly text: string;
	readonly placement: Placement;
	/** A level's prefix, or none. */
	readonly priority: string | null;
	/** The labels' names; undefined leaves the task's own (a new task has none). */
	readonly labels?: readonly string[];
	/** The rule the task repeats by, set as `setRepeat` sets it; null takes it off; undefined leaves the task's own (a new task has none). */
	readonly repeat?: RepeatRule | null;
	/** The task's project (its note's link text), null takes it off; undefined leaves the task's own (a new task has none). A subtask's is its parent's: it takes none. */
	readonly project?: string | null;
}

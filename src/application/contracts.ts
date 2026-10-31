import type { LocalDate, SectionKey, Slot, TaskStatus } from "../domain/Task";
import type { PriorityLevel } from "../settings";

export type { SectionKey };
/** Where a day begins: the UI places slots, events and now on the timeline by it. */
export { DayBoundary } from "../domain/DayBoundary";

/**
 * How the UI names a task between a read and an action: its section, its index among the tasks of that section, the
 * path down to it when it is a subtask, and its raw line as read. A service rejects the action with StaleTaskError when
 * the line at that place no longer matches `raw`.
 */
export interface TaskKey {
	readonly section: SectionKey;
	/** A subtask's is that of the task it belongs to. */
	readonly index: number;
	/** Indexes among the subtasks, from the task down to this one; empty for a task. */
	readonly path: readonly number[];
	readonly raw: string;
}

/** Of a task's own subtasks: how many are done out of those not given up. */
export interface SubtaskProgress {
	readonly done: number;
	readonly total: number;
}

export interface TaskItem {
	readonly key: TaskKey;
	readonly text: string;
	readonly status: TaskStatus;
	readonly dueDate: LocalDate | null;
	readonly slot: Slot | null;
	/** The level whose prefix starts the task's text, which `text` then goes without. */
	readonly priority: PriorityLevel | null;
	/** The open subtasks right under this one, in file order, each with its own. */
	readonly subtasks: readonly TaskItem[];
	/** Null without subtasks. */
	readonly progress: SubtaskProgress | null;
	/** The text of the task a subtask belongs to; null for a task. */
	readonly parentText: string | null;
}

export interface DayView {
	readonly date: LocalDate;
	/** Left column, in file order: see spec §5. */
	readonly list: readonly TaskItem[];
	/** Tasks slotted on this date, in file order: the timeline. */
	readonly slotted: readonly TaskItem[];
}

export class StaleTaskError extends Error {
	constructor() {
		super("The task changed in the file; the view was refreshed");
		this.name = "StaleTaskError";
	}
}

export class TasksFileMissingError extends Error {
	constructor(readonly path: string) {
		super(`Tasks file not found: ${path}`);
		this.name = "TasksFileMissingError";
	}
}

/**
 * Where the task sheet puts a task: Inbox = section Inbox without a due date or slot, Soon = section Soon without a due
 * date, Now = section Now with today's due date (Now is today), Date = a due date.
 */
export type Placement =
	| { readonly kind: "inbox" }
	| { readonly kind: "soon" }
	| { readonly kind: "now" }
	| { readonly kind: "date"; readonly date: LocalDate };

export interface TaskDraft {
	readonly text: string;
	readonly placement: Placement;
	/** A level's prefix, or none. */
	readonly priority: string | null;
}

/**
 * Everything the UI does with tasks. Every mutating call reads the file afresh, applies one operation, writes once,
 * then runs the normalization rules. Rejects with StaleTaskError when `key.raw` no longer matches.
 */
export interface TaskService {
	dayView(date: LocalDate): Promise<DayView>;
	/** The Soon column: Soon tasks without a due date and without a slot, in file order. */
	soonWithoutDateView(): Promise<readonly TaskItem[]>;
	/** Every Inbox task, in file order: none has a due date or a slot (spec §4.4, rule 3). */
	inboxView(): Promise<readonly TaskItem[]>;

	/** Today: end of Now, due today. Another day D: end of Soon with due date D. Whitespace-only text creates nothing. */
	createInList(date: LocalDate, text: string): Promise<void>;
	/** End of Soon, no fields. */
	createInSoon(text: string): Promise<void>;
	/** A slot on `date` at `start`, without a duration; Now when `date` is today, else Soon. */
	createAtTime(date: LocalDate, start: number, text: string): Promise<void>;

	/**
	 * The task sheet. `inbox`: end of Inbox, no due date and no slot, even with `slot`. `soon`: end of Soon, no due date. `now`: end of Now, due today. `date` D: due date D, end of Now
	 * when D is today or earlier, else end of Soon. With `slot`: the slot is kept too (long tap on the timeline).
	 */
	create(draft: TaskDraft, slot?: Slot): Promise<void>;
	/**
	 * The task sheet's Add subtask: the last subtask of `parent`. The parent's own placement gives it no due date of its
	 * own; `now` gives it today's, `date` that date, `inbox` and `soon` none. It stays under the parent whatever the placement.
	 */
	createSubtask(parent: TaskKey, draft: TaskDraft): Promise<void>;
	/**
	 * The task sheet on an existing task: new text and placement in one write. The slot stays. A placement equal to the
	 * task's current one leaves its position in the file alone; a different one moves it as `create` would place it.
	 * Inbox takes the slot away too. A subtask stays where it is: a different placement only sets its due date, as for
	 * `createSubtask`.
	 */
	edit(key: TaskKey, draft: TaskDraft): Promise<void>;
	/** The placement the sheet shows for a task: `now` when it is due today, `date` when it has another due date, else its section (a subtask's is its task's). */
	placementOf(item: TaskItem): Placement;

	setStatus(key: TaskKey, status: TaskStatus): Promise<void>;
	setDueDate(key: TaskKey, date: LocalDate | null): Promise<void>;
	/** A level's prefix first in the task's text, in place of the one it had; null takes it off. */
	setPriority(key: TaskKey, priority: string | null): Promise<void>;
	rename(key: TaskKey, text: string): Promise<void>;
	remove(key: TaskKey): Promise<void>;

	/**
	 * Puts `key` right before the task `before` in the file, in `before`'s section. `before` null: end of the list's section
	 * for `date`. Into Now it comes due today. A subtask leaves its task and becomes a task.
	 */
	moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void>;
	/** Puts `key`, with its own subtasks, among `parent`'s subtasks right before `before` (one of them), or last. */
	nest(key: TaskKey, parent: TaskKey, before: TaskKey | null): Promise<void>;

	/**
	 * Drop on the timeline, move or resize there. Moves a Now task to Soon, without today's due date, when `slot.date` is
	 * not today. This and the moves below take a subtask out of its task first: it goes on as a task.
	 */
	setSlot(key: TaskKey, slot: Slot): Promise<void>;
	/** Drop from the timeline back on the list: the slot goes, due date stays; with `place`, the task moves there as `moveBefore` would. */
	clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void>;

	/** Soon → Day column. Today: end of Now, due today. Another day D: due date D, stays in Soon. */
	moveToList(key: TaskKey, date: LocalDate): Promise<void>;
	/** Day column → Soon: the due date goes. Today the task also moves to the end of Soon. */
	moveToSoon(key: TaskKey, date: LocalDate): Promise<void>;
	/** Put off to `date` (a drop on Tomorrow or Pick a date): due date `date`, no slot; the end of Soon for a later day, of Now for today or earlier. */
	postpone(key: TaskKey, date: LocalDate): Promise<void>;
	/** The end of Inbox or Soon: a drop on that column from the other one, or at the end of its own. Into Inbox the due date and slot go. */
	moveToEnd(key: TaskKey, section: "inbox" | "soon"): Promise<void>;

	/** Applies the normalization rules (spec §4.4). Writes only when something changed. */
	normalize(): Promise<void>;
	/** Creates the tasks file with the five empty sections. */
	createFile(): Promise<void>;

	/** Fires after the file changed, by the plugin or by hand. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

export type CalendarSource = "google" | "work";

export interface CalendarEvent {
	readonly id: string;
	readonly title: string;
	readonly start: Date;
	readonly end: Date;
	readonly allDay: boolean;
	readonly calendar: string;
	/** `#RRGGBB`. The source supplies one; a source without colors falls back to a per-calendar default. */
	readonly color: string;
	readonly source: CalendarSource;
}

export interface SourceStatus {
	readonly source: CalendarSource;
	readonly ok: boolean;
	/** "12 events", "not logged in", "file missing", an error text. */
	readonly message: string;
	/** When this source's data was last fetched successfully (for the work file: its exportedAt). */
	readonly updatedAt: Date | null;
	/** The work file's `device` ("iPhone"); nothing for Google. */
	readonly detail: string | null;
	/** `updatedAt` older than `settings.staleAfterMinutes`, or not ok: the orange dot. */
	readonly stale: boolean;
}

export interface DayEvents {
	readonly events: readonly CalendarEvent[];
	readonly statuses: readonly SourceStatus[];
}

/** Events of both sources for one day. A failing source keeps its last good events and reports the error. */
export interface CalendarService {
	/** Fetches both sources afresh. */
	eventsOn(date: LocalDate): Promise<DayEvents>;
	/** The last result for `date` without a fetch; null when `eventsOn` was never called for it. */
	cached(date: LocalDate): DayEvents | null;
	/** Fires when a source's data changed by itself (the work file arrived), so a fetch now would bring news. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

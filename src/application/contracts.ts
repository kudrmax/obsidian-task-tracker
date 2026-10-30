import type { LocalDate, SectionKey, Slot, TaskStatus } from "../domain/Task";
import type { PriorityLevel } from "../settings";

export type { SectionKey };
/** Where a day begins: the UI places slots, events and now on the timeline by it. */
export { DayBoundary } from "../domain/DayBoundary";

/**
 * How the UI names a task between a read and an action: its section, its index among the tasks of that section,
 * and the raw first line as read. A service rejects the action with StaleTaskError when the line at that index
 * no longer matches `raw`.
 */
export interface TaskKey {
	readonly section: SectionKey;
	readonly index: number;
	readonly raw: string;
}

export interface TaskItem {
	readonly key: TaskKey;
	readonly text: string;
	readonly status: TaskStatus;
	readonly dueDate: LocalDate | null;
	readonly slot: Slot | null;
	/** The level whose prefix starts the task's text, which `text` then goes without. */
	readonly priority: PriorityLevel | null;
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

/** Where the task sheet puts a task: Soon = section Soon without a due date, Now = section Now, Date = a due date. */
export type Placement = { readonly kind: "soon" } | { readonly kind: "now" } | { readonly kind: "date"; readonly date: LocalDate };

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
	/** Soon tasks without a due date and without a slot, in file order. */
	soonView(): Promise<readonly TaskItem[]>;

	/** Today: end of Now. Another day D: end of Soon with due date D. Whitespace-only text creates nothing. */
	createInList(date: LocalDate, text: string): Promise<void>;
	/** End of Soon, no fields. */
	createInSoon(text: string): Promise<void>;
	/** A slot on `date` at `start`, without a duration; Now when `date` is today, else Soon. */
	createAtTime(date: LocalDate, start: number, text: string): Promise<void>;

	/**
	 * The task sheet. `soon`: end of Soon, no due date. `now`: end of Now, no due date. `date` D: due date D, end of Now
	 * when D is today or earlier, else end of Soon. With `slot`: the slot is kept too (long tap on the timeline).
	 */
	create(draft: TaskDraft, slot?: Slot): Promise<void>;
	/**
	 * The task sheet on an existing task: new text and placement in one write. The slot stays. A placement equal to the
	 * task's current one leaves its position in the file alone; a different one moves it as `create` would place it.
	 */
	edit(key: TaskKey, draft: TaskDraft): Promise<void>;
	/** The placement the sheet shows for a task: `date` when it has a due date, else its section. */
	placementOf(item: TaskItem): Placement;

	setStatus(key: TaskKey, status: TaskStatus): Promise<void>;
	setDueDate(key: TaskKey, date: LocalDate | null): Promise<void>;
	/** A level's prefix first in the task's text, in place of the one it had; null takes it off. */
	setPriority(key: TaskKey, priority: string | null): Promise<void>;
	rename(key: TaskKey, text: string): Promise<void>;
	remove(key: TaskKey): Promise<void>;

	/** Puts `key` right before `before` in the file, in `before`'s section. `before` null: end of the list's section for `date`. */
	moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void>;

	/** Drop on the timeline, move or resize there. Moves a Now task to Soon when `slot.date` is not today. */
	setSlot(key: TaskKey, slot: Slot): Promise<void>;
	/** Drop from the timeline back on the list: the slot goes, due date stays; with `place`, the task moves there as `moveBefore` would. */
	clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void>;

	/** Soon → left column. Today: end of Now. Another day D: due date D, stays in Soon. */
	moveToList(key: TaskKey, date: LocalDate): Promise<void>;
	/** Left column → Soon. Today: end of Soon. Another day: due date removed. */
	moveToSoon(key: TaskKey, date: LocalDate): Promise<void>;

	/** Applies the three normalization rules (spec §4.4). Writes only when something changed. */
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

/**
 * The screen's one port (docs/superpowers/specs/2026-11-18-ui-engine.md, «The owners», «Data and writes»): what the screen
 * draws, in the engine's own types; a subscription to its changes; the writes. Product rules sit behind it: where a drop
 * lands, what a menu offers, what a new task becomes. The engine asks and draws the answer. The stand serves it with
 * made-up tasks (`MockPort`); part 2 serves it over the core. It grows step by step with the engine.
 */

/** A list the screen shows: Inbox, Soon, the shown day's. */
export type ListId = "inbox" | "soon" | "day";

/** A card as it is drawn. */
export interface CardFace {
	readonly id: string;
	readonly title: string;
	/** The colour its level paints (a preset's name or `#RRGGBB`); null for none. */
	readonly color: string | null;
	readonly inProgress: boolean;
	/** Of its subtasks, done out of all; null without any. */
	readonly count: { readonly done: number; readonly total: number } | null;
	readonly description: boolean;
	/** The corner: a due date's day over its month; null when none shows. */
	readonly due: { readonly day: string; readonly month: string } | null;
}

/** A row of a list, top to bottom: a task's card at its depth (0 a task, 1 its subtask…), or a section's header. */
export type Row =
	| { readonly kind: "task"; readonly id: string; readonly depth: number }
	| { readonly kind: "section"; readonly id: string; readonly title: string };

export interface ListData {
	readonly title: string;
	readonly rows: readonly Row[];
}

/** A timed task on the shown day's timeline: minutes from the day's start; blocks that overlap stand side by side, this one in `lane` of `lanes`. */
export interface Block {
	readonly id: string;
	readonly start: number;
	readonly end: number;
	readonly lane: number;
	readonly lanes: number;
}

export interface DayData {
	/** Today, Tomorrow, Yesterday or a date. */
	readonly title: string;
	readonly isToday: boolean;
	readonly blocks: readonly Block[];
	/** Each hour line's label, from the day's start: «05», «06», … */
	readonly hours: readonly string[];
}

export interface Now {
	readonly minute: number;
	readonly label: string;
}

/** What the screen shows for a day `offset` days from today. */
export interface ScreenData {
	readonly lists: Readonly<Record<ListId, ListData>>;
	readonly cards: Readonly<Record<string, CardFace>>;
	readonly day: DayData;
}

/**
 * Where a task goes: into `list` before the task `before` (null: the list's end); the day list is that of `dayOffset`.
 * `depth`, when given, is the level it takes there (0 a task, 1 a subtask of the task above…); without it, the level of
 * the task it goes before.
 */
export interface Destination {
	readonly list: ListId;
	readonly before: string | null;
	readonly dayOffset: number;
	readonly depth?: number;
	/** When given, the section it goes into: a section's id, or null for the list's tasks outside any section. */
	readonly section?: string | null;
	/** When given, the task goes onto the calendar of the day `dayOffset`, starting at this minute from the day's start (`list` is "day"). */
	readonly at?: number;
}

/** A menu's item: the port names it and runs it. */
export interface MenuItem {
	readonly id: string;
	readonly label: string;
}

export interface ScreenPort {
	/** The screen for the day `dayOffset` days from today. */
	read(dayOffset: number): ScreenData;
	/** Fires after the data changed: a write, an edit from outside. Returns the unsubscribe. */
	subscribe(listener: () => void): () => void;
	/** The present minute from today's start and the clock's time as the now line writes it: «14:20». */
	now(): Now;
	/**
	 * The screen as it will stand once `move(id, to)` is written: drawn while the task is carried and at the drop, before
	 * the write's read-back. Writes made and not yet read back are in it already.
	 */
	preview(id: string, to: Destination): ScreenData;
	/** Whether `to` takes the task: a place that refuses opens no place for it, and the card's place stays where it was. */
	takes(id: string, to: Destination): boolean;
	/** Writes a task to `to`; resolves once written and read back. */
	move(id: string, to: Destination): Promise<void>;
	/** Where the plus puts a new task's field on the screen showing the day `dayOffset` days from today. */
	newTaskPlace(dayOffset: number): Destination;
	/** A new task from its typed text at `at`; resolves with its id once read back. */
	add(text: string, at: Destination): Promise<string>;
	/** What the task's menu offers. */
	menu(id: string): readonly MenuItem[];
	/** Runs a menu's item on the task. */
	act(id: string, item: string): Promise<void>;
}

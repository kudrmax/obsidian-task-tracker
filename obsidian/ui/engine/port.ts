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

/**
 * A timed task on the shown day's calendar, in minutes from the day's start. The port says where it stands; the calendar
 * lays the stack out (its time scale and the card's height).
 */
export interface Block {
	readonly id: string;
	/** Where it is drawn: its start, or the present minute while it rides the now line (open, today, its time passed). */
	readonly start: number;
	/** Its length; null: none, drawn a card's height. */
	readonly length: number | null;
	/** Its start and end as the clock writes them: «14:15»; no end without a length. */
	readonly clock: string;
	readonly endClock: string | null;
	/** What its corner writes: the start as hours over minutes (in a stack), the length as a number over its unit (shorter than a card). */
	readonly startParts: readonly [string, string];
	readonly lengthParts: readonly [string, string] | null;
	/** A folded task's next open step, which names its block; null: the task's own title. */
	readonly step: string | null;
}

/** How an event is painted in one theme: its ground, its bar and its title (CSS colours). */
export interface EventInk {
	readonly bg: string;
	readonly bar: string;
	readonly text: string;
}

/** An event's paint in each theme, from its calendar's colour by the plugin's rule: the screen shows the theme's own. */
export interface EventPaint {
	readonly dark: EventInk;
	readonly light: EventInk;
}

/** A calendar's event on the shown day: read-only, in its calendar's colour; one already over is faded (`past`). */
export interface DayEvent {
	readonly id: string;
	readonly title: string;
	/** Minutes from the day's start, cut at the day's edges. */
	readonly start: number;
	readonly end: number;
	readonly past: boolean;
	readonly paint: EventPaint;
}

/** An all-day event, a row over the calendar. */
export interface AllDayEvent {
	readonly id: string;
	readonly title: string;
	readonly past: boolean;
	readonly paint: EventPaint;
}

/** A selected task's dot: the top one moves its start, the bottom one its end. */
export type Edge = "start" | "end";

export interface DayData {
	/** Today, Tomorrow, Yesterday or a date. */
	readonly title: string;
	readonly isToday: boolean;
	readonly blocks: readonly Block[];
	readonly events: readonly DayEvent[];
	readonly allDay: readonly AllDayEvent[];
	/** Each hour line's label, from the day's start: «05», «06», … */
	readonly hours: readonly string[];
	/** The hour another day opens at, in minutes from the day's start (the «Scroll to hour» setting). */
	readonly opensAt: number;
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
	/** With `at`: the end it takes (null: no length); absent, a task keeps its length (none when it had no time). */
	readonly end?: number | null;
	/** When given, a new task goes as the last subtask of this task, wherever it stands (Add subtask on a calendar's task). */
	readonly under?: string;
	/** A new task written to Backlog, which the screen doesn't show: its field stays where it stands. */
	readonly backlog?: boolean;
	/** A new task written at the end of this list (the day's of `dayOffset`), which the screen as laid out can't show: its field stays where it stands. */
	readonly away?: { readonly list: ListId; readonly dayOffset: number };
}

/** A place the new task's bar offers: the lists, and a day picked on the month. */
export type PlaceId = "inbox" | "backlog" | "soon" | "now" | "date";

/** What the bar has set for the task being typed: its level and its project. */
export interface EntryDraft {
	readonly level: string | null;
	readonly project: string | null;
}

/**
 * The field a task is typed in (the plugin's one `QuickEntry` field): where its text is written, and the task whose
 * title it edits; a new task and a rename are the same field.
 */
export interface EntryField {
	/** Where the typed task goes: a list's slot, a minute of the calendar, the end of a calendar task's stack (`under`). */
	readonly at: Destination;
	/** The task renamed; null for a new one. */
	readonly renaming: string | null;
	/** The field stands in an open menu's stack (a calendar task's new subtask, or a card of the stack renamed), not on the screen. */
	readonly stack: boolean;
}

/** A rename's field as it opens: where it stands, what its bar starts with (the task's level and project), its text. */
export interface RenameStart {
	readonly field: EntryField;
	readonly draft: EntryDraft;
	readonly text: string;
}

/** What Enter or a tap elsewhere does with the field's text (the plugin's `QuickEntry.enter` and `blur`): the port decides. */
export interface EntryCommit {
	/** The write; null when nothing is written (an empty text, a name unchanged). */
	readonly write: Promise<unknown> | null;
	/** The renamed card as it will read, shown on every card at once until the write is read back (F298); null for none. */
	readonly face: CardFace | null;
	/** The field open next (batch typing, a level out, a new task under a renamed one); null: typing ends. */
	readonly next: EntryField | null;
	/** What the next field's bar starts with. */
	readonly draft: EntryDraft;
}

/**
 * The bar of a task being typed (F184–F189, the plugin's `QuickBarState`), as the port answers for the field where it
 * stands and what is set and typed: each button shown or not, enabled or not, and what it shows.
 */
export interface EntryBar {
	/** The level buttons (none on the calendar's field nor in a stack; shown but off in a rename), and which way the field may go. */
	readonly indents: boolean;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** The flag's levels, the one set (or typed as a prefix) on; `tint` the colour of the flag and the field. */
	readonly levels: readonly LevelTile[];
	readonly tint: string | null;
	/** The project button's page (none on a subtask's field): the tree, the one set checked, folders not to be chosen. */
	readonly projects: { readonly options: readonly { readonly name: string; readonly depth: number; readonly on: boolean; readonly folder: boolean }[]; readonly lit: boolean } | null;
	/** The place button (none on a subtask's or the calendar's field): what it shows, and the places offered. */
	readonly where: { readonly id: PlaceId; readonly title: string } | null;
	readonly places: readonly { readonly id: PlaceId; readonly title: string; readonly on: boolean }[];
	/** The month page of Date: today, and the day the field stands on (`YYYY-MM-DD`). */
	readonly date: { readonly today: string; readonly picked: string | null };
}

/** Where a task's menu is opened from: a list's card, a calendar's block, a card of a block's stack in its menu (F107). */
export type MenuFrom = "list" | "calendar" | "stack";

/** A status tile: Done, In progress (Stop progress on a task in progress), Won't do, Stop (a repeating task). */
export type StatusId = "done" | "inProgress" | "stopProgress" | "wontDo" | "stop";
/** A row of the edit group, in the plugin's order. */
export type EditId = "rename" | "reminder" | "description" | "repeat" | "section" | "project" | "subtask" | "firstStep";
/** A move tile: today, tomorrow, or the month to pick a day in. */
export type MoveId = "today" | "tomorrow" | "pick";
/** How a timed task reminds on the iPhone. */
export type ReminderKind = "live" | "notification" | "alarm" | "none";
/** A row of the open group. */
export type OpenId = "fullScreen" | "obsidian";

/** A priority level's tile: its prefix, its colour (a preset's name or `#RRGGBB`) and whether the task has it. */
export interface LevelTile {
	readonly prefix: string;
	readonly color: string;
	readonly on: boolean;
}

/**
 * A task's menu as the port offers it (the plugin's `TaskMenuModel`): every group in the order drawn, a group with nothing
 * to offer empty. The screen draws it and sends back what was tapped (`MenuAction`).
 */
export interface TaskMenuModel {
	readonly kind: "task";
	/** The task's title, as Delete's question names it: «Delete “…”?». */
	readonly title: string;
	/**
	 * The title of the task the status tiles write, as their questions name it: a folded block's shown step (the core's
	 * `statusTask`, `docs/plugin/screen.md` «Done в нём тоже закрывает шаг»), any other the task's own.
	 */
	readonly statusTitle: string;
	readonly statuses: readonly { readonly id: StatusId; readonly confirm: boolean }[];
	/** In the settings' order; `disabled` while the task may have no priority. */
	readonly levels: { readonly tiles: readonly LevelTile[]; readonly disabled: boolean };
	/** No tile for the day the task already stands on; none for a task put off nowhere. */
	readonly moves: readonly MoveId[];
	/** The month page: today, the task's due day (shown picked), and whether Remove due date is offered. Days are `YYYY-MM-DD`. */
	readonly date: { readonly today: string; readonly picked: string | null; readonly removable: boolean };
	/** The rows with their values on the right (Reminder's, Repeat's rule, Section's and Project's names); Project on a subtask disabled. */
	readonly edits: readonly { readonly id: EditId; readonly value: string; readonly disabled: boolean }[];
	readonly opens: readonly OpenId[];
	/** Delete, asking first when `confirm`; null: none. */
	readonly remove: { readonly confirm: boolean } | null;
	/** The Reminder page's kinds, the task's own checked. */
	readonly reminders: readonly { readonly kind: ReminderKind; readonly checked: boolean }[];
	/** The start of the task's description, over its copy (markdown); null without one. */
	readonly peek: string | null;
	/** A calendar's task: its open subtasks, standing between its copy and the panel (F107); none elsewhere. */
	readonly subtasks: readonly string[];
}

/** An event's menu: its one row, Open in Calendar. */
export interface EventMenuModel {
	readonly kind: "event";
	readonly title: string;
}

export type MenuModel = TaskMenuModel | EventMenuModel;

/** What a tap in a menu writes; the port says what it means for the task. */
export type MenuAction =
	| { readonly kind: "status"; readonly id: StatusId }
	| { readonly kind: "priority"; readonly prefix: string }
	| { readonly kind: "move"; readonly id: "today" | "tomorrow" }
	/** A day picked on the month page (`YYYY-MM-DD`); null: Remove due date. */
	| { readonly kind: "date"; readonly date: string | null }
	| { readonly kind: "reminder"; readonly reminder: ReminderKind }
	| { readonly kind: "delete" }
	/** A row whose own screen is part 2's (Repeat, Section, Project, First step, Add description, the open rows, Open in Calendar): on the stand it closes the menu and writes nothing. */
	| { readonly kind: "row"; readonly id: EditId | OpenId | "calendar" };

export interface ScreenPort {
	/** The screen for the day `dayOffset` days from today. */
	read(dayOffset: number): ScreenData;
	/** Fires after the data changed: a write, an edit from outside. Returns the unsubscribe. The screen reads again each minute too: what rides the now line and what is past changes with the clock. */
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
	/**
	 * The screen while the `edge` dot of the calendar's task `id` is held at `minute` (from the shown day's start): the
	 * task drawn stretched as far as the rules let it (the end no earlier than the start; the start no later than the end,
	 * and on a task without a length no later than its start, which becomes its end).
	 */
	stretched(id: string, dayOffset: number, edge: Edge, minute: number): ScreenData;
	/**
	 * Where the task goes once its `edge` dot is let go at `minute`; null when nothing changes. Stretched no longer than
	 * `least` minutes it keeps no length; the bottom dot changes only how long it lasts (a task riding the now line keeps its
	 * start in the file).
	 */
	resized(id: string, dayOffset: number, edge: Edge, minute: number, least: number): Destination | null;
	/** Writes a task to `to`; resolves once written and read back. */
	move(id: string, to: Destination): Promise<void>;
	/** A minute from the day's start as the clock writes it: «14:15» (the day starts at the port's hour). */
	clockAt(minute: number): string;
	/** Where a tap on the plus puts a new task's field, on the screen showing the day `dayOffset` days from today and the lists `shown` (F174). */
	newTaskPlace(dayOffset: number, shown: readonly ListId[]): Destination;
	/** The end of `list` (the day's of `dayOffset`), in its last section, at the top level: where a double click on its free room opens a new task's field. */
	listEnd(list: ListId, dayOffset: number): Destination;
	/** Where Add subtask opens the field of a new last subtask of `id` in its list (F124): under its last subtask, a level deeper. */
	subtaskPlace(id: string, dayOffset: number): Destination;
	/** The bar of `field`, with what is set (`draft`) and typed (`text`). */
	entryBar(field: EntryField, draft: EntryDraft, text: string): EntryBar;
	/**
	 * Where the field goes for a place picked on the bar (`date` with Date): the end of that list or day, when it is one of
	 * the lists the screen can bring into sight (`reach`); else the field stays and the task is written there.
	 */
	entryPlace(field: EntryField, choice: PlaceId, date: string | null, reach: readonly ListId[]): EntryField;
	/** Rename of the task `id` from its menu opened `from` there (F117): the field in the card's place, the bar set as the task is. */
	rename(id: string, from: MenuFrom, dayOffset: number): RenameStart;
	/** Enter (`next`) or a tap elsewhere on `field` holding `text`: what is written and which field opens next. */
	commit(field: EntryField, text: string, draft: EntryDraft, next: boolean): EntryCommit;
	/** What the menu of the task or event `id` offers, opened `from` there. */
	menu(id: string, from: MenuFrom): MenuModel;
	/** Writes what was tapped in the menu of `id` opened `from` there (a status tile of a folded block writes its step); resolves once written and read back. */
	act(id: string, action: MenuAction, from?: MenuFrom): Promise<void>;
}

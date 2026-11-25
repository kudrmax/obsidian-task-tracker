import type { DividerStop, EntryBarGroup, FieldActionId, FieldGroup, ListWidths, MenuActionGroup, MenuStatusId, TaskActionId, TaskMenuActionId, TaskMenuGroup, UndoOutcome } from "../../../core/application/contracts";

/**
 * The task actions are the core's (`core/application/taskActions.ts`, task actions spec): the ids, the groups and the
 * offered actions a surface lays out. The port answers with them; the engine keeps only each action's look and handler,
 * an exhaustive `Record` over the surface's ids. Types only: the engine runs no code of the core.
 */
export type { DividerStop, EntryBarGroup, FieldActionId, FieldGroup, ListWidths, MenuActionGroup, MenuStatusId, TaskActionId, TaskMenuActionId, TaskMenuGroup, UndoOutcome };

/**
 * The screen's one port (docs/superpowers/specs/2026-11-18-ui-engine.md, «The owners», «Data and writes»): what the screen
 * draws, in the engine's own types; a subscription to its changes; the writes. Product rules sit behind it: where a drop
 * lands, what a menu offers, what a new task becomes. The engine asks and draws the answer. The stand serves it with
 * made-up tasks (`MockPort`); part 2 serves it over the core. It grows step by step with the engine.
 */

/** A list the screen shows: Inbox, Soon, the shown day's. */
export type ListId = "inbox" | "soon" | "day";
/** Every list drawn: Done too, left of Inbox, while the search keeps it in sight (F257); its cards are tapped, never carried or typed into. */
export type ShownList = ListId | "done";

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
	/**
	 * A folded task's next open step (F79, F94): in a list drawn under the task's own title, which goes small over it; on the
	 * calendar it names the block alone. Null: no step shows, the task's own title is its name everywhere.
	 */
	readonly step: string | null;
	/** Its subtasks are folded away under its card: a card peeks out under it in a list (F81). */
	readonly folded: boolean;
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
	readonly lists: Readonly<Record<ShownList, ListData>>;
	readonly cards: Readonly<Record<string, CardFace>>;
	readonly day: DayData;
	/** No tasks file (F6): what the screen says instead of its lists, and the button that creates the file; null while there is one. */
	readonly missing: MissingFile | null;
}

/** The levels a place allows, shallowest and deepest. */
export interface LevelRange {
	readonly min: number;
	readonly max: number;
}

/** The words the screen shows without a tasks file: where it was looked for, and the button's. */
export interface MissingFile {
	readonly text: string;
	readonly create: string;
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
	/** The other picked tasks carried with this one (F149): they go there too, in one write. */
	readonly along?: readonly string[];
	/** A new task written to Backlog, which the screen doesn't show: its field stays where it stands. */
	readonly backlog?: boolean;
	/** A new task written at the end of this list (the day's of `dayOffset`), which the screen as laid out can't show: its field stays where it stands. */
	readonly away?: { readonly list: ListId; readonly dayOffset: number };
}

/** A place the new task's bar offers: the lists, and a day picked on the month. */
export type PlaceId = "inbox" | "backlog" | "soon" | "now" | "date";

/**
 * What the bar has set for the task being typed: its level, its projects (several, as the menu's), the description's
 * line under the title (null while it is closed), and whether the field writes a new section's name instead of a task.
 */
export interface EntryDraft {
	readonly level: string | null;
	readonly projects: readonly string[];
	/** The description's line under the title: what is typed in it while it is open, null while it is closed. */
	readonly descriptionLine: string | null;
	readonly section: boolean;
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
 * The bar of a task being typed (F184–F189, the core's `EntryState`), as the port answers for the field where it stands
 * and what is set and typed: its buttons group by group as the table of task actions places them (`bar`, each with
 * `disabled` and `lit`), and what their panels offer.
 */
export interface EntryBar {
	readonly bar: readonly EntryBarGroup[];
	/** The flag's levels, the one set (or typed as a prefix) on; `tint` the colour of the flag and the field. */
	readonly levels: readonly LevelTile[];
	readonly tint: string | null;
	/** The Project page: the tree, each project checked while the field has it, folders not to be chosen. */
	readonly project: ProjectPage;
	/** What the place button shows, and the places its panel offers. */
	readonly where: { readonly id: PlaceId; readonly title: string } | null;
	/** `title` null: Date, whose word is the bar's own look. */
	readonly places: readonly { readonly id: PlaceId; readonly title: string | null; readonly on: boolean }[];
	/** The month page of Date: today, and the day the field stands on (`YYYY-MM-DD`). */
	readonly date: { readonly today: string; readonly picked: string | null };
}

/** A project of a Project page (the bar's and the menu's), the tree in its order (the core's `MenuProjectOption`): how deep, whether the task has it, whether it can't be picked (a folder it hasn't). */
export interface ProjectChoice {
	readonly name: string;
	readonly depth: number;
	readonly on: boolean;
	readonly disabled: boolean;
}

/** A Project page as the core's `MenuProject` offers it: the choices, whether No project is checked, the words of No project and «New project…». */
export interface ProjectPage {
	readonly options: readonly ProjectChoice[];
	readonly none: boolean;
	readonly noneLabel: string;
	readonly newLabel: string;
}

/** Where a task's menu is opened from: a list's card, a calendar's block, a card of a block's stack in its menu (F107). */
export type MenuFrom = "list" | "calendar" | "stack";

/** How a timed task reminds on the iPhone. */
export type ReminderKind = "live" | "notification" | "alarm" | "none";
/** A list tile of Pick a date's page: where a tap sends the task (the core's `sendTo`). */
export type ListPlaceId = Exclude<PlaceId, "date">;

/** A priority level's tile: its prefix, its colour (a preset's name or `#RRGGBB`) and whether the task has it. */
export interface LevelTile {
	readonly prefix: string;
	readonly color: string;
	readonly on: boolean;
}

/**
 * A task's menu as the port offers it (the core's `TaskMenuModel`): `layout`, the task actions group by group as the table
 * places them (statuses, levels, labels, the copy, When, Edit, the rows, Delete), and what its pages show. The screen
 * draws it and sends back what was tapped (`MenuAction`).
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
	readonly layout: readonly MenuActionGroup<TaskMenuActionId>[];
	/** The level tiles, in the settings' order (the `level` action's group). */
	readonly levels: readonly LevelTile[];
	/** The label tiles (the `label` action's group): a label's name, its colour, whether the task has it. */
	readonly labels: readonly { readonly name: string; readonly color: string; readonly on: boolean }[];
	/** Pick a date's page: today, the task's due day (shown picked), and whether Remove due date is offered. Days are `YYYY-MM-DD`. */
	readonly date: { readonly today: string; readonly picked: string | null; readonly removable: boolean };
	/** Pick a date's list tiles above the month (the core's `places`), each on while the task goes there; none for a subtask. */
	readonly places: readonly { readonly id: ListPlaceId; readonly title: string; readonly on: boolean }[];
	/** The Project page (F122, F123): the tree, each project checked while the task has it, folders not to be chosen. */
	readonly project: ProjectPage;
	/** The Reminder page's kinds, the task's own checked. */
	readonly reminders: readonly { readonly kind: ReminderKind; readonly checked: boolean }[];
	/** The start of the task's description, over its copy (markdown); null without one. */
	readonly peek: string | null;
	/** A calendar's task: its open subtasks, standing between its copy and the panel (F107); none elsewhere. */
	readonly subtasks: readonly string[];
	/** The menu for several picked tasks: Delete's words, «Delete N tasks» (F140); absent, Delete. */
	readonly deleteLabel?: string;
}

/** An event's menu: its one row, Open in Calendar. */
export interface EventMenuModel {
	readonly kind: "event";
	readonly title: string;
}

export type MenuModel = TaskMenuModel | EventMenuModel;

/** What a tap in a menu writes; the port says what it means for the task. */
export type MenuAction =
	| { readonly kind: "status"; readonly id: MenuStatusId }
	| { readonly kind: "priority"; readonly prefix: string }
	| { readonly kind: "label"; readonly name: string }
	/** A day: Today's or Tomorrow's tile (the day the layout gives it), or one picked on the month (`YYYY-MM-DD`); null: Remove due date. */
	| { readonly kind: "date"; readonly date: string | null }
	/** A list tile of Pick a date's page: the task goes there as it is (the core's `sendTo`). */
	| { readonly kind: "sendTo"; readonly list: ListPlaceId }
	| { readonly kind: "reminder"; readonly reminder: ReminderKind }
	/** A project of the Project page: on beside the task's others, or off (the core's `toggleProject`); null: No project, all off. */
	| { readonly kind: "project"; readonly name: string | null }
	/** «New project…» named `name` (F220): made at the tree's top unless the tree has it, and the task gets it (the core's `newProject`). */
	| { readonly kind: "newProject"; readonly name: string }
	| { readonly kind: "delete" }
	/** An action whose own screen is part 2's (Repeat, Section, First step, the opens, Open in Calendar): on the stand it closes the menu and writes nothing. */
	| { readonly kind: "row"; readonly id: TaskActionId | "calendar" };

/**
 * What the screen is drawn in besides the day: the chosen project (null: every task). Another one is a change of context,
 * drawn in place (spec, principle 3; F23). The view mode joins it when the modes come (Decision 132).
 */
export interface ScreenContext {
	readonly project: string | null;
	/** Done is drawn left of Inbox: the search brought the screen there (F257). Absent: it is not. */
	readonly done?: boolean;
}

/** A piece of a found task's words; `match`, a piece the search found (drawn picked out). */
export interface FoundPart {
	readonly text: string;
	readonly match: boolean;
}

/**
 * A task the search found (the core's `SearchHit`, F252–F254): its card's face; its title in pieces (none when the
 * title has no match); the line under it where the search found the query, its project's name or its notes; where it
 * stands among the projects while the screen is drawn in one («Дружба», «iPhone»), null otherwise.
 */
export interface Found {
	readonly id: string;
	readonly face: CardFace;
	readonly title: readonly FoundPart[];
	readonly line: { readonly kind: "project" | "notes"; readonly parts: readonly FoundPart[] } | null;
	readonly path: readonly string[] | null;
}

/** The tasks the search found in one list, under the list's name, the best first. */
export interface FoundGroup {
	readonly title: string;
	readonly hits: readonly Found[];
}

/**
 * Where a found task shows once the screen goes to it (the core's `reveal`, F255): its list (Backlog's under Inbox, a
 * subtask's where its task stands), the day of a task on a day, and the context it shows in: a project chosen that hides
 * it is let go.
 */
export interface Revealed {
	readonly list: ShownList;
	/** The day it stands on, in days from today: shown beside its calendar; null for a list of no day. */
	readonly day: number | null;
	readonly context: ScreenContext;
}

/**
 * The field for what the model missed under an answer (F312): its words, the write of its text into the task the model
 * chose (resolving to the line to show when it failed, null once written), and the same button pressed again.
 */
export interface AnswerField {
	readonly placeholder: string;
	readonly save: string;
	readonly saveAndAsk: string;
	write(text: string): Promise<string | null>;
	again(): void;
}

/** What an assistant's run came to, ready to draw (the core's `AssistantOutcome` but Stop, which shows nothing). */
export type Answer =
	| { readonly kind: "task"; readonly title: string; readonly face: CardFace; readonly notice: string | null; readonly note: string; readonly field: AnswerField | null }
	| { readonly kind: "failed"; readonly title: string; readonly words: string };

/** What a list's cards take besides a tap: picked (Select tasks, ⌘-click), carried, a new task typed among them. */
export interface ListAbilities {
	readonly pick: boolean;
	readonly carry: boolean;
	readonly type: boolean;
}

/** A row of «⋯» the assistant offers (the core's `AssistantOffer`, F261–F263): Best task, or Stop while its run waits, its icon a spinning ring then. */
export interface MoreRow {
	readonly id: string;
	readonly label: string;
	readonly icon: string;
	readonly running: boolean;
}

/** Every task: no project chosen. */
export const EVERY_TASK: ScreenContext = { project: null };

export interface ScreenPort {
	/** The screen for the day `dayOffset` days from today, in `context` (every task when absent). */
	read(dayOffset: number, context?: ScreenContext): ScreenData;
	/** Fires after the data changed: a write, an edit from outside. Returns the unsubscribe. The screen reads again each minute too: what rides the now line and what is past changes with the clock. */
	subscribe(listener: () => void): () => void;
	/** The present minute from today's start and the clock's time as the now line writes it: «14:20». */
	now(): Now;
	/**
	 * The screen as it will stand once `move(id, to)` is written: drawn while the task is carried and at the drop, before
	 * the write's read-back. Writes made and not yet read back are in it already.
	 */
	preview(id: string, to: Destination, context?: ScreenContext): ScreenData;
	/** Whether `to` takes the task: a place that refuses opens no place for it, and the card's place stays where it was. */
	takes(id: string, to: Destination): boolean;
	/** Whether letting the task go at `to` changes anything: false where it stands already (a card let go where it was lifted, a block at its own minute), and nothing is written. */
	changes(id: string, to: Destination): boolean;
	/**
	 * The screen while the `edge` dot of the calendar's task `id` is held at `minute` (from the shown day's start): the
	 * task drawn stretched as far as the rules let it (the end no earlier than the start; the start no later than the end,
	 * and on a task without a length no later than its start, which becomes its end).
	 */
	stretched(id: string, dayOffset: number, edge: Edge, minute: number, context?: ScreenContext): ScreenData;
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
	/** The end of `list` (the day's of `dayOffset`), in its last section, at the top level: where a double click on its free room opens a new task's field; null for a list no task is typed into (Done). */
	listEnd(list: ShownList, dayOffset: number): Destination | null;
	/** Where Add subtask opens the field of a new last subtask of `id` opened `from` there: in its list under its last subtask, a level deeper (F124); a calendar task's in its menu's stack (F108). */
	subtaskPlace(id: string, dayOffset: number, from: MenuFrom): EntryField;
	/** The field shifted a level in (1) or out (-1) as the rules let it (its depth fitted between its neighbours), with what is set and typed; null where it can't go. */
	entryShift(field: EntryField, draft: EntryDraft, text: string, by: 1 | -1): EntryField | null;
	/** The minute a gesture lands on: `minute` snapped to the step the hour's height `hourPx` allows a finger moving `tolerancePx` (the core's snap, E3). */
	snap(minute: number, hourPx: number, tolerancePx: number): number;
	/** The levels a card may take between a card at level `above` and one at level `below` (null: none, or a section's header): the core's nesting (E7). */
	levels(above: number | null, below: number | null): LevelRange;
	/** Creates the tasks file with its five empty sections (F6); the screen reads it once written. */
	createFile(): Promise<void>;
	/** What a new task's field at `field` starts with set: in a project's screen its project, in a list's part that part's (the core's quick entry). */
	entryDraft(field: EntryField): EntryDraft;
	/** The bar of `field`, with what is set (`draft`) and typed (`text`). */
	entryBar(field: EntryField, draft: EntryDraft, text: string): EntryBar;
	/**
	 * Where the field goes for a place picked on the bar (`date` with Date): the end of that list or day, when it is one of
	 * the lists the screen can bring into sight (`reach`); else the field stays and the task is written there.
	 */
	entryPlace(field: EntryField, choice: PlaceId, date: string | null, reach: readonly ListId[]): EntryField;
	/** The text the description's line opens with (Description on the bar): a renamed task's own description, else empty. */
	entryDescription(field: EntryField): string;
	/** Rename of the task `id` from its menu opened `from` there (F117): the field in the card's place, the bar set as the task is. */
	rename(id: string, from: MenuFrom, dayOffset: number): RenameStart;
	/** Enter (`next`) or a tap elsewhere on `field` holding `text`: what is written and which field opens next. */
	commit(field: EntryField, text: string, draft: EntryDraft, next: boolean): EntryCommit;
	/** Whether a project's name as typed names nothing (the core's `isBlankProjectName`): «New project…» then makes none and goes back to the projects. */
	blankProjectName(name: string): boolean;
	/**
	 * «New project…» on the bar (F220): the project named `name` made at the tree's top unless the tree has it (any case),
	 * no task given it yet (the core's `newProject(name, [])`); resolves to the project the field may take, null for none
	 * (a name of nothing, a folder's).
	 */
	newProject(name: string): Promise<string | null>;
	/** What the menu of the task or event `id` offers, opened `from` there on the screen of the day `dayOffset` days from today. */
	menu(id: string, from: MenuFrom, dayOffset: number): MenuModel;
	/**
	 * The screen's own steps taken back and done again, as the core's `UndoService` keeps them (F267–F270): one action one
	 * step, an edit from outside none. Whether there is one to take back (Undo is dim without one) or to do again; a change
	 * of either fires `subscribe`.
	 */
	canUndo(): boolean;
	canRedo(): boolean;
	/** Takes the screen's last step back; resolves once written and read back: done, nothing to take back, or refused because the file changed under it. */
	undo(): Promise<UndoOutcome>;
	redo(): Promise<UndoOutcome>;
	/** What the notice says after `step` came out as `outcome` («Can’t undo: the tasks file changed»); null: no notice. */
	undoNotice(step: "undo" | "redo", outcome: UndoOutcome): string | null;
	/**
	 * Writes what was tapped in the menu of `id` opened `from` there on the day `dayOffset` (a status tile of a folded block writes its step);
	 * resolves once written and read back, to the task's id as the file now has it (the core's key is fresh after a
	 * write, so a menu left open on its page goes on with it), null once it is gone.
	 */
	act(id: string, action: MenuAction, from: MenuFrom, dayOffset: number): Promise<string | null>;
	/** The tasks whose words hold `query`, grouped by list (the core's `search`, F252–F254); an empty query finds nothing. */
	search(query: string): Promise<readonly FoundGroup[]>;
	/** The found task `id` shown (the core's `reveal`, F255): its tasks unfold over it, and where the screen goes to show it. Null once it is gone. */
	reveal(id: string): Promise<Revealed | null>;
	/** «⋯»'s rows the assistant offers now (F261); none where no model is served (F266). */
	moreRows(): readonly MoreRow[];
	/** Something «⋯» started still runs: its dots are a spinning ring (F262). A change of it or of the rows fires `subscribe`. */
	busy(): boolean;
	/** A tap on an assistant's row of «⋯»: its run starts, or stops while it runs (F263); its answer comes as the host shows it. */
	pressMore(id: string): void;
	/** What the cards of `list` take besides a tap (F135, F257): picked for actions on several tasks (the core's `canPick`), carried, a task typed in; Done's none of them. */
	listDoes(list: ShownList): ListAbilities;
	/** Whether a carry that ended so ends Select tasks (the core's `endsSelection`): one that landed does, whatever it carried. */
	endsPicking(landed: boolean): boolean;
	/** The menu for the tasks `ids` picked at once (the core's `bulkMenu`, F140–F144), opened over the screen of the day `dayOffset`. */
	bulkMenu(ids: readonly string[], dayOffset: number): TaskMenuModel;
	/** Writes what was tapped in the bulk menu on every picked task, in one write; resolves to their ids as the file now has them (null for one gone). */
	actAll(ids: readonly string[], action: MenuAction, dayOffset: number): Promise<readonly (string | null)[]>;
	/** The picked tasks that go along when `lifted`, one of them, is carried (the core's `carried`, F149): the others, but those under another picked one. */
	carriedWith(lifted: string, picked: readonly string[]): readonly string[];
	/** The day list's width beside the calendar (the core's `listWidth`, core audit pair E8): its bounds on a phone, the width `share` draws in a window `viewWidth` wide. */
	readonly listBounds: { readonly min: number; readonly max: number };
	listWidths(share: number, viewWidth: number, dividerWidth: number): ListWidths;
	listShareOf(width: number, viewWidth: number, dividerWidth: number): number;
	/** Where the divider dragged to make the list `wanted` wide stands, the finger moving at `speed` px/ms: held to the middle when brought there slowly. */
	dividerAt(wanted: number, widths: ListWidths, speed: number): DividerStop;
}

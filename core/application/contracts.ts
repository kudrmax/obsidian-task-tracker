import type { GroupName, LocalDate, ReminderKind, SectionKey, Slot, TaskStatus } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import type { EndList, GroupedList, GroupPlace } from "../domain/Lists";
import type { Placement, TaskDraft } from "../domain/Placement";
import type { LabelLevel } from "../domain/Label";
import type { PresetColor, PriorityColor, PriorityLevel } from "../domain/Priority";
import type { DayColumn, DayRelation, TaskScreen } from "../domain/Days";
import type { DayBoundary } from "../domain/DayBoundary";
import type { SectionChoice, SectionOffer } from "./sections";
import type { ListPlace } from "./nesting";

export type { GroupName, ReminderKind, SectionKey };
/** What In progress or Stop progress sets on tasks of these statuses. */
export { nextProgress } from "../domain/Task";
/** Whether two slots are the same time: the same day, start and end. */
export { sameSlot } from "../domain/Task";
/** The kinds a task's reminder is chosen from, in the order the menu offers them. */
export { REMINDER_KINDS } from "../domain/Task";
export type { RepeatRule, RepeatUnit, Weekday } from "../domain/Repeat";
/** Whether two rules are the same but for where they are anchored: the UI asks, never compares rules itself. */
export { sameRule } from "../domain/Repeat";
/** The parts a rule is worded with («every 3 weeks», «on the 5th», a weekly schedule's days): the UI composes its summary from them. */
export { repeatParts, type RepeatParts } from "../domain/Repeat";
/**
 * The repeat panel's rules: `repeatDraft(day, rule)` is what it offers and shows for a rule (a new one from `day`, a task's
 * `repeatDay` or the quick entry's), `editRepeat(draft, change)` the draft after a tap, or null when the tap changes nothing.
 */
export { editRepeat, repeatDraft, type RepeatChange, type RepeatDraft, type RepeatKind } from "../domain/RepeatDraft";
/** Where a day begins: the UI places slots, events and now on the timeline by it. */
export { DayBoundary } from "../domain/DayBoundary";
/** Minutes in a day: the timeline's length. */
export { MINUTES_PER_DAY } from "../domain/LocalDate";
/** Minutes from the start of the shown day to a card's start and end; a null end for a task without a duration. */
export type { Span as DaySpan } from "../domain/DayBoundary";
import type { Span as DaySpan } from "../domain/DayBoundary";
import type { ResizeEdge, StretchSpan } from "./TimelineSpans";
export type { ResizeEdge, StretchSpan } from "./TimelineSpans";
/** Whether two placements are the same place: the same kind, and for a date the same day. */
export { samePlacement } from "../domain/operations";
/** How the UI tells tasks apart by their keys: the same place, the same line, one task with its subtasks, an id. */
export { keyId, sameLine, samePlace, sameTaskTree } from "./taskKeys";
/** Where a card may go among cards with levels, and what a gap among them means: the nesting rules of the file. */
export { fitLevel, gapOfPlace, levelRange, placeOfGap, shiftLevel, type GapPlace, type LevelCard, type ListCard, type ListPlace } from "./nesting";
/** What a drop in a gap means, and none when it changes nothing; which section a gap is in; where a lifted section goes. */
export { gapAt, groupPlaceOf, placeOfDrop, sameGap } from "./nesting";
/** Typing tasks in place: every rule of the quick entry, the frontend drawing its state and turning gestures into its calls. */
export { QuickEntrySession, type EntryAt, type EntryDrawing, type EntrySpot, type EntryState, type ListEntry as EntryInList, type PendingText, type PlaceChoice, type PlaceMove, type QuickEntryTasks, type QuickEntryView, type WriteLine } from "./QuickEntrySession";
/** What Enter, Escape and a tap elsewhere mean for a section's name typed in place. */
export { SectionNameEntry } from "./SectionNameEntry";
/** What a task menu's repeat page writes: a rule changed there as the menu closes, unless it is the task's own again; Remove at once. */
export { RepeatPage } from "./RepeatPage";
/** When the full screen's description editor writes, and when a change made elsewhere replaces what it shows. */
export { DescriptionDraft } from "./DescriptionDraft";
/** A list in its sections, and whether it shows their headers. */
export { listView, type ListGroup, type ListRow, type ListView } from "./sections";
/** What the corner of a card shows on a column's day: the due date unless it is that day, and the repeat icon. */
export { cardDue, type CardDue } from "./cardDue";
/** Where in its list's sections a task, or several, can go from a menu, by the sections offered with the screen. */
export { sectionChoice, type SectionChoice, type SectionOffer } from "./sections";
/** What a new description starts as in the editor: one empty point, which alone is no description. */
export { DESCRIPTION_TEMPLATE } from "../domain/description";
/** A task's text cut into text and links, each link by its word. */
export { textParts, type TextPart } from "../domain/TaskText";
/** A task is one line of the file: a line break in its title reads as one space, the same as the domain writes it. */
export { LINE_BREAK, oneLine } from "../domain/TaskTitle";
import type { ScreenBehaviour, SectionNames } from "../settings";
export type { ScreenBehaviour, SectionNames } from "../settings";
export { sameLevels } from "../settings";
export type { Clock } from "./ports";

/** A priority level, its colours in the order the settings offer them. */
export { type LabelLevel, labelTitle, sameLabels } from "../domain/Label";
export { isPresetColor, PRIORITY_COLORS, type PresetColor, type PriorityColor, type PriorityLevel, usableColor } from "../domain/Priority";
export type { DayColumn, DayRelation, EndList, GroupedList, GroupPlace, Placement, TaskDraft, TaskScreen };
/** How a level's or a label's colour paints a card, and a calendar's an event, in either theme: every frontend draws the same shades. */
export { bgAlphaFor, contrast, EVENT_BG_ALPHA, eventColors, type EventColors, eventHex, inkOf, type PriorityShades, shadesOf, type Theme } from "./paints";
/** A day as the screens name it (`Today`, `Tue, 3 Nov`), and a due date as a card's corner writes it. */
export { dayTitle, type DueLabel, dueLabel } from "./dayLabels";
/** How deep each event of a day lies over the others on the timeline. */
export { type EventLevel, eventLevels, type EventSpan } from "./eventLevels";

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

/**
 * Where to create a task: a place in a list, a place in the day column on `date` (its list and day are the column's,
 * see `dayColumn`), a place among subtasks, or a slot on the calendar.
 */
export type NewTaskPlace =
	| { readonly kind: "list"; readonly list: GroupedList; readonly group: GroupName; readonly before: TaskKey | null; readonly date?: LocalDate }
	| { readonly kind: "day"; readonly date: LocalDate; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "subtask"; readonly parent: TaskKey; readonly before: TaskKey | null }
	| { readonly kind: "slot"; readonly slot: Slot };

/** Where a section is written from the quick-entry field: a top-level place in a column that shows sections. */
export type SectionPlace = Extract<NewTaskPlace, { readonly kind: "list" } | { readonly kind: "day" }>;

/** A group of a list where it stands in the file: a section (`name`) or No section (null). */
export interface ListSection {
	readonly name: GroupName;
	/** A section with no task under its heading: a column of its list shows its heading and the No tasks plate. */
	readonly empty: boolean;
}

/** Of a task's own subtasks: how many are done out of those not given up. */
export interface SubtaskProgress {
	readonly done: number;
	readonly total: number;
}

export interface TaskItem {
	readonly key: TaskKey;
	readonly text: string;
	/** `text` with each link's word in its place: for where a link can't be shown, such as a question about the task. */
	readonly title: string;
	readonly status: TaskStatus;
	readonly dueDate: LocalDate | null;
	readonly slot: Slot | null;
	/** How long its slot lasts in minutes; null without a slot or without a duration. */
	readonly durationMin: number | null;
	/** How the phone reminds of the task at its slot's start; a task without a slot keeps the default. */
	readonly reminder: ReminderKind;
	/** The rule after the task's repeat marker; null for a task that does not repeat. */
	readonly repeat: RepeatRule | null;
	/** Not done and not given up: todo or in progress. */
	readonly open: boolean;
	/** The task may be given a rule: an open task or subtask; a closed task repeats no more. */
	readonly repeatable: boolean;
	/** The level whose prefix starts the task's text, which `text` then goes without. */
	readonly priority: PriorityLevel | null;
	/** The labels the task is tagged with, in the settings' order; none while it has a priority, which wins on a line with both. */
	readonly labels: readonly LabelLevel[];
	/** The colours its card is drawn in: its priority's alone, else each label's in the settings' order; the first tints it. None without either. */
	readonly colors: readonly PriorityColor[];
	/** The section of its list it sits in; null outside any. */
	readonly group: GroupName;
	/** The list the task is in, its task's for a subtask. */
	readonly list: SectionKey;
	/** It sits under another task. */
	readonly isSubtask: boolean;
	/** The day the task stands on: its slot's, today for Now, else its due date. */
	readonly day: LocalDate | null;
	/** The day a new rule on the task is drawn from (`repeatDraft`): the day `setRepeat` anchors it at, else today. */
	readonly repeatDay: LocalDate;
	/**
	 * What may be done to it: put off (not a done task), its due date taken off (one it has, not today's), a reminder (a task
	 * on a time), a priority set (one without labels), labels set (one without a priority), stopped (a task that repeats and
	 * may), a description added (one without any), its subtasks folded away (one with an open subtask).
	 */
	readonly can: {
		readonly postpone: boolean;
		readonly removeDue: boolean;
		readonly remind: boolean;
		readonly setPriority: boolean;
		readonly setLabels: boolean;
		readonly stop: boolean;
		readonly addDescription: boolean;
		readonly fold: boolean;
		/** Its time stretched by the dots on its edges: a task on the timeline. */
		readonly resize: boolean;
	};

	/** The open subtasks right under this one, in file order, each with its own. */
	readonly subtasks: readonly TaskItem[];
	/** Every subtask right under this one, done and given up ones too, in file order, each with all its own. */
	readonly allSubtasks: readonly TaskItem[];
	/** Null without subtasks. */
	readonly progress: SubtaskProgress | null;
	/** Its open subtasks are folded away: a list draws its card without them. Only a task with an open subtask is. */
	readonly collapsed: boolean;
	/** The text of the task a subtask belongs to; null for a task. */
	readonly parentText: string | null;
	/** The key of the task a subtask belongs to, its line as read; null for a task. */
	readonly parentKey: TaskKey | null;
	/** Its nested lines without a checkbox as Markdown, its first level unindented; null without any. */
	readonly description: string | null;
}

/** Where a new subtask stands among the rows of the full screen: the row it takes, and its depth. */
export interface FullPlace {
	readonly index: number;
	readonly level: number;
}

/** A subtask of the full screen's tree: at its depth (0 right under the task), and where a new last subtask of its own goes. */
export interface FullRow {
	readonly item: TaskItem;
	readonly level: number;
	readonly newSubtask: FullPlace;
}

/** A task as the full screen shows it: every subtask at every depth, done and given-up ones too, none folded away. */
export interface FullTree {
	readonly task: TaskItem;
	/** The subtasks for the list: each holds all its own in `subtasks` and is not collapsed, so the list draws them all. */
	readonly subtasks: readonly TaskItem[];
	/** The same subtasks in the order the list draws them. */
	readonly rows: readonly FullRow[];
	/** Where a new last subtask of the task itself goes: after every row, at the first depth. */
	readonly newSubtask: FullPlace;
}

/** A piece of a found task's text; `match` marks a piece the search found. */
export interface FoundPart {
	readonly text: string;
	readonly match: boolean;
}

/**
 * A task the search found: its title in pieces (empty when the title has none), and a line of the description's words
 * from a little before the first found piece (null when it has none).
 */
export interface SearchHit {
	readonly item: TaskItem;
	readonly title: readonly FoundPart[];
	readonly description: readonly FoundPart[] | null;
}

/** The tasks the search found in one list, the best first; the groups stand Inbox, Backlog, Soon, Now, Done, none for a list with nothing found. */
export interface SearchGroup {
	readonly list: SectionKey;
	readonly hits: readonly SearchHit[];
}

/** Whose sections a column shows: Inbox's, Backlog's, Soon's, Now's for today, Soon's for a later day with that day as `date`. */
export interface ColumnSections {
	readonly list: GroupedList;
	/** The later day the column shows; null for one of no day or for today. */
	readonly date: LocalDate | null;
}

export interface DayView {
	readonly date: LocalDate;
	/** Left column, in file order: see spec §5. */
	readonly list: readonly TaskItem[];
	/** Tasks slotted on this date, in file order: the timeline. */
	readonly slotted: readonly TaskItem[];
}

/** The task a call names is no longer at its place in the file, as read: the frontend says so and reads the tasks anew. */
export class StaleTaskError extends Error {
	readonly code = "staleTask";
	constructor() {
		super("stale task");
		this.name = "StaleTaskError";
	}
}

/** No tasks file at `path`: the frontend says so, or offers to create it. */
export class TasksFileMissingError extends Error {
	readonly code = "tasksFileMissing";
	constructor(readonly path: string) {
		super(`tasks file missing: ${path}`);
		this.name = "TasksFileMissingError";
	}
}

/** One change `applyAll` makes to a task: each kind does what the single call of that name does. */
export type TaskChange =
	| { readonly kind: "status"; readonly status: TaskStatus }
	| { readonly kind: "priority"; readonly priority: string | null }
	| { readonly kind: "labels"; readonly labels: readonly string[] }
	| { readonly kind: "dueDate"; readonly date: LocalDate | null }
	| { readonly kind: "postpone"; readonly date: LocalDate }
	| { readonly kind: "remove" }
	| { readonly kind: "stop" }
	| { readonly kind: "moveBefore"; readonly before: TaskKey | null; readonly date: LocalDate }
	| { readonly kind: "moveToList"; readonly date: LocalDate }
	| { readonly kind: "moveToSoon"; readonly date: LocalDate }
	| { readonly kind: "moveToEnd"; readonly section: EndList }
	| { readonly kind: "moveToGroup"; readonly list: GroupedList; readonly group: GroupName; readonly before: TaskKey | null; readonly date?: LocalDate }
	| { readonly kind: "createGroup"; readonly list: GroupedList; readonly name: string; readonly date?: LocalDate }
	| { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null };

export interface TaskStep {
	readonly key: TaskKey;
	readonly change: TaskChange;
}

/** The lists a card is dragged from or dropped on: the day list beside the calendar, Soon, and Inbox over Backlog. */
export type DropColumn = "day" | "soon" | "inbox" | "backlog";
/** Where a task that exists is dragged from. */
export type DropFrom = DropColumn | "timeline";
/** Where a drag begins: a task's place, or "new" for the plus that carries a task not yet written. */
export type DropOrigin = DropFrom | "new";

/** Where a task is let go, as the gesture found it. */
export type DropTo =
	/** On the timeline at `start`, minutes from the start of the shown day, snapped to its grid: `TaskService.dropSpan` is where it lands. */
	| { readonly kind: "time"; readonly start: number }
	| { readonly kind: "clearSlot" }
	/** A gap of a list that shows no sections: right before `before`, or at the end (null). */
	| { readonly kind: "list"; readonly column: DropColumn; readonly before: TaskKey | null }
	/** A gap of a list that shows sections: right before `before`, or at the end of `group`; `date`, the later day of the column. */
	| { readonly kind: "group"; readonly list: GroupedList; readonly date: LocalDate | null; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null }
	/**
	 * A gap of a list column as the gesture found it: what it means there (`ListPlace`), or null for the column's end where
	 * it places nothing in a gap (`placesInGap`). The service reads it as one of the three above by whose sections the
	 * column shows on the drop's day (`columnSections`): a frontend never picks between them.
	 */
	| { readonly kind: "place"; readonly column: DropColumn; readonly place: ListPlace | null };

/** A task let go, and where it was dragged from. */
export interface DroppedTask {
	readonly key: TaskKey;
	readonly from: DropFrom;
}

/** Whether a target takes the tasks carried from these places, and whether a list shows where in it a task goes or puts it at its end. */
export { acceptsDrop, placesInGap } from "./drops";

/** A quick move of a task menu: Today, Tomorrow, or Pick a date, which asks for the day. */
export type QuickMoveId = "today" | "tomorrow" | "pick";

export interface QuickMove {
	readonly id: QuickMoveId;
	/** The day it puts the tasks off to; null for Pick a date. */
	readonly date: LocalDate | null;
}

/** A level's tile: on when every task that may have a priority has this one. */
export interface MenuLevel {
	readonly level: PriorityLevel;
	readonly on: boolean;
}

/** A label's tile: on when every task that may carry labels has it. */
export interface MenuLabel {
	readonly label: LabelLevel;
	readonly on: boolean;
}

/** A section a menu's Section page offers; `checked` on the one every task stands in. */
export interface MenuSectionOption {
	/** Null: the tasks outside any section, named `SectionChoice.ungrouped`. */
	readonly name: GroupName;
	readonly checked: boolean;
}

/** Where in their list's sections the tasks can go. */
export interface MenuSections {
	readonly choice: SectionChoice;
	/** The page's rows: the list's sections in `choice.names`' order, then the tasks outside any. */
	readonly options: readonly MenuSectionOption[];
	/** The page ends in New section, which asks for a name: one task's menu only. */
	readonly create: boolean;
}

/**
 * Where a task's menu was opened: a card of a list column (`DropColumn`), of the timeline, of Done, a subtask in the stack
 * under a timeline card's menu, or the task on the whole screen.
 */
export type MenuFrom = DropColumn | "timeline" | "done" | "stack" | "full";

/** A picked task of the bulk menu and the column its card stands in. */
export interface PickedTask {
	readonly item: TaskItem;
	readonly from: MenuFrom;
}

/** The screen a menu opens over: today, the day it shows, and the sections its menus offer (`ScreenView.offer`). */
export interface MenuScreen {
	readonly today: LocalDate;
	readonly day: LocalDate;
	readonly offer: SectionOffer;
}

/** A status tile: Done, In progress or Stop progress (todo again, when every task is in progress), Won't do, Stop. */
export type MenuStatusId = "done" | "inProgress" | "stopProgress" | "wontDo" | "stop";

export interface MenuStatus {
	readonly id: MenuStatusId;
	/** The menu asks first, in place of the group, and writes once it is confirmed. */
	readonly confirm: boolean;
}

/** A row of the Reminder page: a kind, in the order the menu offers them; `checked` on the task's own. */
export interface MenuReminder {
	readonly kind: ReminderKind;
	readonly checked: boolean;
}

/** A row of the edit group. */
export type MenuEditId = "rename" | "reminder" | "description" | "repeat" | "section" | "subtask";

/**
 * The menu of one task, or of several picked at once, as `TaskService.menu` and `bulkMenu` read it: what its groups offer,
 * what is on, what can't be pressed, and what asks first. A status tile writes `pickStatus`, a level `togglePriority`, a
 * label `toggleLabel`, a move `postpone` (`postponeAll`), Remove due date `removeDue`, Delete `remove` (`removeAll`). A tap
 * on a label keeps the menu open, drawn again for the tasks as they then stand, and the bulk menu its picked tasks; any
 * other pick closes it and lets the picked tasks go.
 */
/**
 * What a task's menu or the bulk menu offers, every row but the frontend's own navigation: the Obsidian plugin's Open
 * full screen and Open in Obsidian are its own ways out of the menu, drawn above Delete, and no part of the model.
 */
export interface TaskMenuModel {
	/** Done, the progress tile, Won't do, in this order; Stop last on one task that may be stopped. A task done or given up has them all too. */
	readonly statuses: readonly MenuStatus[];
	/** In the settings' order; `disabled` while none of the tasks may have a priority (they carry labels). */
	readonly levels: { readonly tiles: readonly MenuLevel[]; readonly disabled: boolean };
	/** In the settings' order; `disabled` while none of the tasks may carry labels (they have a priority). */
	readonly labels: { readonly tiles: readonly MenuLabel[]; readonly disabled: boolean };
	/** Today, Tomorrow, Pick a date: a move is offered when one of the tasks doesn't stand on its day already; none for tasks put off nowhere. */
	readonly moves: readonly QuickMove[];
	/** Pick a date offers Remove due date: one of the tasks has a due date that can be taken off. */
	readonly removeDue: boolean;
	/** The due date they all have, which Pick a date shows picked; null when they differ or have none. */
	readonly dueDate: LocalDate | null;
	/** Only where the cards stand in columns that show their list's sections, and the tasks can go among one list's sections. */
	readonly sections: MenuSections | null;
	/**
	 * One task's: Rename; Reminder (a task on a time); Add description (one without any); Repeat (one that may repeat);
	 * Section (with `sections`); Add subtask, except for a subtask of a timeline card's stack. The bulk menu's: Section alone.
	 */
	readonly edits: readonly MenuEditId[];
	/** The Reminder page's rows, Off last; none without the Reminder row. */
	readonly reminders: readonly MenuReminder[];
	/** Delete, offered on every task (null: not offered); it asks first in one task's menu, the bulk menu's Delete N tasks writes at once. */
	readonly remove: { readonly confirm: boolean } | null;
}

/** The tasks the screen shows for a day: its column and timeline, the other lists, their sections and what the menus offer. */
export interface ScreenView {
	readonly day: DayView;
	readonly soon: readonly TaskItem[];
	readonly inbox: readonly TaskItem[];
	readonly backlog: readonly TaskItem[];
	readonly done: readonly TaskItem[];
	readonly sections: Readonly<Record<GroupedList, readonly ListSection[]>>;
	readonly offer: SectionOffer;
	/** No tasks file: every list is empty, and the frontend offers to create the file. */
	readonly missing: boolean;
	/** The day's events, their sources and the switch's dot are shown: not while the tasks file is missing. */
	readonly calendars: boolean;
}

/**
 * Everything the UI does with tasks. Every mutating call reads the file afresh, applies one operation, writes once,
 * then runs the normalization rules. Rejects with StaleTaskError when `key.raw` no longer matches.
 */
/** A call that takes the last task out of a section takes the section away; a section left empty any other way stays. */
/** The marks a task being typed is written with, and what may still be chosen for it: the bar shows exactly these. */
export interface DraftMarks {
	readonly priority: PriorityLevel | null;
	/** In the settings' order; none while there is a priority. */
	readonly labels: readonly LabelLevel[];
	readonly can: { readonly setPriority: boolean; readonly setLabels: boolean };
	/** The colour the field and the flag take: the priority's, else the first label's; none without either. */
	readonly tint: PriorityColor | null;
	/** Every level and then every label, as the flag's panel offers them: on when the task is written with it, enabled while it may be chosen. */
	readonly tiles: { readonly levels: readonly MarkTile<PriorityLevel>[]; readonly labels: readonly MarkTile<LabelLevel>[] };
}

/** A level or a label offered for a task being typed. */
export interface MarkTile<T> {
	readonly mark: T;
	readonly on: boolean;
	readonly enabled: boolean;
}

export interface TaskService {
	/** The levels that mark tasks, in the settings' order: one-word prefixes, the first of two alike. */
	priorityLevels(): readonly PriorityLevel[];
	/** The labels that tag tasks, in the settings' order: usable names, the first of two alike. */
	labelLevels(): readonly LabelLevel[];
	/** The level a typed title starts with and the title without it, as the file will read it. */
	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null };
	/** Nothing to write: no text, or a level's prefix alone. */
	isBlank(text: string): boolean;
	/** `text` with `prefix` first in place of the one it had; null takes it off. */
	withPriority(text: string, prefix: string | null): string;

	/** Everything the screen shows of the tasks for `date`, the file normalized first; without a tasks file, the empty screen that says so (`missing`). */
	screen(date: LocalDate): Promise<ScreenView>;
	dayView(date: LocalDate): Promise<DayView>;
	/** The Soon column: Soon tasks without a due date and without a slot, in file order. */
	soonWithoutDateView(): Promise<readonly TaskItem[]>;
	/** Every Inbox task, in file order: none has a due date or a slot (spec §4.4, rule 3). */
	inboxView(): Promise<readonly TaskItem[]>;
	/** Every Backlog task, in file order: none has a due date or a slot, as in Inbox. */
	backlogView(): Promise<readonly TaskItem[]>;
	/** Every Done task, in file order. */
	doneView(): Promise<readonly TaskItem[]>;
	/**
	 * The tasks the screen draws whose title or description holds the query as Obsidian's quick switcher finds it: the
	 * query's words in their order, each a part of a word; in a title, failing that, its letters in their order. Case and
	 * accents aside («ё» is «е»), a description read by its words, not its Markdown. Inbox, Backlog, Soon, Now, Done, and in
	 * each the best match first: one in the title before one only in the description, then by score, ties in file order.
	 * A query of spaces finds nothing. Each list's finds in a group of its own.
	 */
	search(query: string): Promise<readonly SearchGroup[]>;
	/**
	 * Where a task shows: Done, Inbox or Backlog in its list; another on the day it stands on, Soon without one. A subtask
	 * shows under its task, so where that task does. Where that is on its screens is the frontend's.
	 */
	screenOf(item: TaskItem): Promise<TaskScreen>;
	/** A found task shown: a subtask's tasks show their subtasks (`unfoldAbove`), so its card stands in the list; then `screenOf` it. */
	reveal(item: TaskItem): Promise<TaskScreen>;
	/** The task `key` names among `items` and their subtasks, at every depth; null when none is. */
	findIn(items: readonly TaskItem[], key: TaskKey): TaskItem | null;

	/**
	 * Each grouped list's groups in file order, empty sections included (empty sections spec §5). A column draws the
	 * groups its tasks are in and the empty sections of its list, in this order; No section is never empty here.
	 */
	listSections(): Promise<Readonly<Record<GroupedList, readonly ListSection[]>>>;
	/** The sections a task's menu offers in each list, the screen showing `date` (see `SectionOffer`); `sectionChoice` picks a task's. */
	sectionOffer(date: LocalDate): Promise<SectionOffer>;

	/** Today: end of Now, due today. Another day D: end of Soon with due date D. Whitespace-only text creates nothing. */
	createInList(date: LocalDate, text: string): Promise<void>;
	/** End of Soon, no fields. */
	createInSoon(text: string): Promise<void>;
	/** A slot on `date` at `start`, without a duration; Now when `date` is today, else Soon. */
	createAtTime(date: LocalDate, start: number, text: string): Promise<void>;

	/**
	 * Quick entry. `list`: in section `group` of the list right before `before` (null: at the end of the section), with the
	 * due-date rules of `moveToGroup`: Now gets today, Inbox none, Soon `date` (the column's day) or none. `subtask`: among
	 * `parent`'s subtasks before `before` or last; it has no due date of its own. `slot`: as `createAtTime`. `priority` is a
	 * level's prefix or null; whitespace-only text creates nothing. `repeat` is set as `setRepeat` sets it, in the same write, on a task or a subtask: a slot takes none.
	 * One write per call. Gives the new task's key as the file stands after the write, wherever its rules put it (a schedule
	 * takes an Inbox task to Soon); null when nothing was created.
	 */
	createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels?: readonly string[]): Promise<TaskKey | null>;
	/**
	 * The marks `createInPlace`, `create` or `edit` writes for a title typed as `text` with `priority` (a level's prefix or
	 * null) and `labels` chosen: the chosen priority, else the level the text's first word is; the labels only without one.
	 */
	draftMarks(text: string, priority: string | null, labels: readonly string[]): DraftMarks;

	/**
	 * The task sheet. `inbox`, `backlog`: end of that section, no due date and no slot, even with `slot`. `soon`: end of Soon, no due date. `now`: end of Now, due today. `date` D: due date D, end of Now
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
	 * `createSubtask`. A blank text (a level's prefix alone too) writes nothing. The task as it now stands, its key fresh;
	 * null when nothing was written.
	 */
	edit(key: TaskKey, draft: TaskDraft): Promise<TaskItem | null>;
	/** The placement the sheet shows for a task: `now` when it is due today, `date` when it has another due date, else its section (a subtask's is its task's). */
	placementOf(item: TaskItem): Placement;
	/** What the day column stands for on `date`: today is Now with its sections, a later day Soon with that day, a past day Now with that day and no sections. */
	dayColumn(date: LocalDate): DayColumn;
	/** Whose sections `column` shows on `date` (sections spec §5.1): Inbox, Backlog and Soon their own; the day column `dayColumn`'s list, none for a past day. */
	columnSections(column: DropColumn, date: LocalDate): ColumnSections | null;
	/** The placement of a task for `date`: `now` for today, else `date`. */
	placementOfDay(date: LocalDate): Placement;
	/** The name a list goes by wherever the screens name a place, Done too: its section's name in the settings. A day is named by its date. */
	listName(list: SectionKey): string;
	/** The day a placement puts a task on: today for `now`, its day for `date`, none for a list. */
	dayOfPlacement(placement: Placement): LocalDate | null;

	setStatus(key: TaskKey, status: TaskStatus): Promise<void>;
	/** The circle of a task: an open one, by its status in the file, is ticked done; a done or given-up one is open again. */
	toggleDone(key: TaskKey): Promise<void>;
	setDueDate(key: TaskKey, date: LocalDate | null): Promise<void>;
	/** A level's prefix first in the task's text, in place of the one it had; null takes it off. */
	setPriority(key: TaskKey, priority: string | null): Promise<void>;
	/** The task's labels become these names, written as tags; a task with a priority keeps none. The task as it now stands, its key fresh; null once it is gone. */
	setLabels(key: TaskKey, labels: readonly string[]): Promise<TaskItem | null>;
	/** `setLabels` for several tasks in one write; each task as it then stands, in the order given, null for one gone. */
	setLabelsAll(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): Promise<readonly (TaskItem | null)[]>;
	/** How the phone reminds of a task on a time: the marker before its slot. */
	setReminder(key: TaskKey, reminder: ReminderKind): Promise<void>;
	/**
	 * A tap on level `prefix` in a menu of these tasks: taken off them all when every one that may have a priority has it,
	 * else set on them all (a task with labels keeps its labels and gets none). One write.
	 */
	togglePriority(keys: readonly TaskKey[], prefix: string): Promise<void>;
	/**
	 * A tap on label `name` in a menu of these tasks: taken off them all when every one that may carry labels has it, else
	 * put last on each that lacks it; a task with a priority keeps none. One write; each task as it then stands, in the order
	 * given, its key fresh; null for one gone.
	 */
	toggleLabel(keys: readonly TaskKey[], name: string): Promise<readonly (TaskItem | null)[]>;
	/** Remove due date in a menu of these tasks: the due date goes from each that can lose it (not today's); the rest stay as they are. One write. */
	removeDue(keys: readonly TaskKey[]): Promise<void>;
	/**
	 * The menu of one task, opened `from` a place of `screen` (see `TaskMenuModel`): a card of a column that shows its
	 * list's sections offers them (`sectionChoice`); a timeline card, Done, a stack's subtask and the whole screen none.
	 */
	menu(item: TaskItem, from: MenuFrom, screen: MenuScreen): TaskMenuModel;
	/** The bulk menu of the picked tasks: sections only when every card stands in a column that shows its list's. */
	bulkMenu(picked: readonly PickedTask[], screen: MenuScreen): TaskMenuModel;
	/** A status tile of a menu of these tasks (`MenuStatusId`): Won't do gives them up, Stop stops them as `stop` does. One write. */
	pickStatus(keys: readonly TaskKey[], id: MenuStatusId): Promise<void>;
	/** A move of a menu of these tasks: each that may be put off is, as `postpone` does; the rest stay as they are. One write. */
	postponeAll(keys: readonly TaskKey[], date: LocalDate): Promise<void>;
	/** Delete in a menu of these tasks: each goes, as `remove` does. One write. */
	removeAll(keys: readonly TaskKey[]): Promise<void>;
	/** The picked tasks that go along when `lifted`, one of them, is carried: all but itself and those under another picked one, which go with it. */
	carried(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[];
	/** Folds the task's subtasks away on the screen, or shows them again: the marker on its line. A task without an open subtask has nothing to fold. */
	setCollapsed(key: TaskKey, collapsed: boolean): Promise<void>;
	/** A tap on a card's subtask counter: its subtasks fold away, or show again when they were folded. */
	toggleCollapsed(key: TaskKey): Promise<void>;
	/** The tasks a subtask sits under show their subtasks again, so its card stands in the list. */
	unfoldAbove(key: TaskKey): Promise<void>;
	/**
	 * Sets or replaces the task's repeat rule; null takes it off. A schedule on an undated task gives it the first suitable
	 * day as its due date, and the rule is anchored at the task's day. Closing a task that repeats writes its next copy in the same write.
	 */
	setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void>;
	/** Stops a repeating task: the rule goes and the task is done, with no next copy. */
	stop(key: TaskKey): Promise<void>;
	/**
	 * The title as typed: on one line and trimmed, a level's prefix first the priority of a task without one (a task's own
	 * priority and labels stay, as for `edit`). A blank text, or the same title and marks, writes nothing. The task as it now
	 * stands, its key fresh; null when nothing was written.
	 */
	rename(key: TaskKey, text: string): Promise<TaskItem | null>;
	/** The task as the full screen shows it: its tree, and where a new subtask stands in it. */
	fullTree(item: TaskItem): FullTree;
	/**
	 * The description from Markdown, one block right under the task and before its subtasks; the same text writes
	 * nothing, an empty one or `DESCRIPTION_TEMPLATE` alone takes it away. Blank lines go: they would end the task in the file.
	 */
	setDescription(key: TaskKey, markdown: string): Promise<void>;
	remove(key: TaskKey): Promise<void>;
	/** The task's line in the file, from 0, once the file is normalized: where Open in Obsidian puts the cursor. */
	lineOf(key: TaskKey): Promise<number>;
	/**
	 * The task `key` names as the file now has it: its line at its place; moved, the one line like it anywhere; else the
	 * task at its place whose text is `text`, its other fields changed there. Null when none of these is found.
	 */
	find(key: TaskKey, text: string): Promise<TaskItem | null>;

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
	/**
	 * Where the card of slotted `item` stands on the timeline of `day`, by the clock: on its time, or on today, an open
	 * task whose start has passed rides the now line, its duration kept. The file keeps its time.
	 */
	shownSpan(item: TaskItem, day: LocalDate): DaySpan;
	/**
	 * Where a card let go on the timeline at `start` (minutes from the day's start, snapped) stands, as a drop there writes
	 * it: one from the timeline keeps its duration, one from a list or the plus (`item` null) gets none; within the day,
	 * a card as long as it is, one without a duration starting a step before the end at the latest.
	 */
	dropSpan(item: TaskItem | null, from: DropOrigin, start: number): DaySpan;
	/**
	 * The minute a drag, a drop or a stretch on the timeline stands at, `minute` minutes from the day's start, the timeline
	 * drawn `hourPx` pixels an hour: the nearest step, within the day. The step is the finest of 5, 15, 30 and 60 minutes a
	 * finger moves at least `tolerancePx` for, the frontend's touch tolerance in the same units (the plugin's 9 px: 30 at
	 * 28 px an hour, 15 at 56, 5 from 112 on).
	 */
	snap(minute: number, hourPx: number, tolerancePx: number): number;
	/** The slot of a new task let go or long-tapped on the timeline of `day` at `start`: no duration, as `dropSpan` places it. */
	newSlot(day: LocalDate, start: number): Slot;
	/**
	 * The card of slotted `item` while its `edge` dot is held at `minute` of `day`: the end no earlier than the start nor
	 * past the day; the start no earlier than the day nor past the end, and on a task without a duration no later than its
	 * start, which becomes the end.
	 */
	stretch(item: TaskItem, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan;
	/**
	 * The `edge` dot let go at `minute` of `day`, a card being `minDurationMin` minutes tall: writes the task's new time as
	 * `setSlot` does. A span no longer than a card loses its duration and stands at its start; a task without one whose start
	 * dot was pulled keeps its start. The bottom dot changes only how long the task lasts, so a card riding the now line
	 * ends where the finger let go while the file keeps its own start; the top dot is a new start and writes it.
	 * Resolves false, writing nothing, when the time stays as shown.
	 */
	resize(key: TaskKey, day: LocalDate, edge: ResizeEdge, minute: number, minDurationMin: number): Promise<boolean>;
	/** Drop from the timeline back on the list: the slot goes, due date stays; with `place`, the task moves there as `moveBefore` would. */
	clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void>;

	/** Soon → Day column. Today: end of Now, due today. Another day D: due date D, stays in Soon. */
	moveToList(key: TaskKey, date: LocalDate): Promise<void>;
	/** Day column → Soon: the due date goes. Today the task also moves to the end of Soon. */
	moveToSoon(key: TaskKey, date: LocalDate): Promise<void>;
	/** Put off to `date` (a drop on Tomorrow or Pick a date): due date `date`, no slot; the end of Soon for a later day, of Now for today or earlier. */
	postpone(key: TaskKey, date: LocalDate): Promise<void>;
	/** The end of Inbox, Backlog or Soon: a drop on that list from another one, or at the end of its own. Into Inbox and Backlog the due date and slot go. */
	moveToEnd(key: TaskKey, section: EndList): Promise<void>;

	/**
	 * A drop into a gap of a list that shows sections (sections spec §5.3): right before `before`, in its section, or at
	 * the end of `group` when `before` is null (or a task of another list: a later day's column shows Now's tasks too).
	 * The slot goes. Into Now it comes due today; into Inbox no due date; into Soon `date`, the later day of the column
	 * dropped on, or none.
	 */
	moveToGroup(key: TaskKey, list: GroupedList, group: GroupName, before: TaskKey | null, date?: LocalDate): Promise<void>;
	/**
	 * A drop on a section zone with the name it gives (sections spec §5.2): a preset goes in the presets' order among the
	 * presets the list has, any other name last. A name the list has already takes the task in; the No section name puts
	 * it among the tasks outside any section. The task enters the list as with `moveToGroup`.
	 */
	createGroup(key: TaskKey, list: GroupedList, name: string, date?: LocalDate): Promise<void>;
	/**
	 * A menu's section picked, or a new one named: each task into section `name` of its list, null outside any, as
	 * `createGroup` takes a name; the name as typed, trimmed, a blank one writing nothing; a task of Soon keeps its due date. One task as `moveToGroup` or `createGroup`, several as
	 * one `applyAll`. The section a task stands in already is no exception: it goes to its end.
	 */
	toSection(keys: readonly TaskKey[], name: GroupName): Promise<void>;
	/** A lifted section let go (sections spec §5.4); No section moves too. */
	moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Promise<void>;
	/** The name as typed, trimmed: a blank one or the section's own writes nothing; a name the list has merges the two; the No section name hands the tasks to it. Resolves true when it wrote. */
	renameGroup(list: GroupedList, group: string, name: string): Promise<boolean>;
	/** The heading goes; its tasks, in order, join the end of No section. */
	removeGroup(list: GroupedList, group: string): Promise<void>;
	/**
	 * The field switched to a section, Enter (empty sections spec §4). `### name` goes where the field stands: the tasks the
	 * column shows below it in its group, in order, go into the new section, written right after that group; the tasks it does
	 * not show stay. At the end of a group the section is written empty and stays. A blank name or the No section name writes
	 * nothing; the group's own name writes nothing; a name the list has takes the tasks below to the end of that section.
	 * One write, one undo step. Gives the section the tasks went to, or null when nothing was written.
	 */
	createSection(name: string, place: SectionPlace): Promise<{ readonly list: GroupedList; readonly group: string } | null>;

	/**
	 * Several tasks at once (bulk actions spec): every step in one write, in the order the tasks stand in the file, so
	 * tasks moved to one place keep their order there. A key, `before` or `parent` names the task as read, wherever the
	 * steps before it moved it. A move skips a task whose own task moves too: it goes along. A task already gone with
	 * its removed task is skipped. Rejects with StaleTaskError, writing nothing, when any key no longer matches.
	 */
	applyAll(steps: readonly TaskStep[]): Promise<void>;
	/**
	 * A drop of one task or several on `to`, the day column showing `day`: what spec §5.1 makes of it. One task as the single
	 * call it means (`setSlot`, `clearSlot`, `moveToGroup`, `nest`, `moveBefore`, `moveToList`, `moveToSoon`, `moveToEnd`);
	 * several as `applyAll` of what each means by where it came from, never on the timeline. A list without sections puts a
	 * task from another column at its end (see `placesInGap`). Gives the tasks' keys as the file now has them, in their
	 * order, so the screen settles the card on the task where it stands; one not found again is left out.
	 */
	drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<readonly TaskKey[]>;

	/** Applies the normalization rules (spec §4.4). Writes only when something changed. */
	normalize(): Promise<void>;
	/** Creates the tasks file with the five empty sections. */
	createFile(): Promise<void>;

	/** Fires after the file changed, by the plugin or by hand. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/** How today changed: `passed`, the clock passed the hour the day starts at; `moved`, the setting moved that hour. */
export type DayChange = "passed" | "moved";

/** Which day today is and where it begins, by the clock and the hour the settings start the day at. */
/** Where a day's timeline opens, minutes from the day's start: on the now line (today), or at an hour (another day). */
export type DayOpening = { readonly kind: "now"; readonly minute: number } | { readonly kind: "hour"; readonly minute: number };

export interface DayService {
	today(): LocalDate;
	/** Where a day begins: the timeline places slots, events and now by it. */
	boundary(): DayBoundary;
	/** How `date` stands to today; the words for it are the frontend's. */
	relation(date: LocalDate): DayRelation;
	/** The day `days` after `date`, before it for a negative count: the step of the day arrows and of the screens past today. */
	step(date: LocalDate, days: number): LocalDate;
	/** Where the timeline of `date` opens: today on the now line, another day at the hour the settings name. */
	openAt(date: LocalDate): DayOpening;
	/**
	 * Fires when today changes. `passed` is checked once a minute while anyone listens, and the tasks file is normalized
	 * before it fires; while a listener is not `ready` (a screen hidden or held by a gesture) the minute's check waits for
	 * `catchUp`. `moved` fires at once on another hour for the day's start, even when the date stays: the day's hours moved.
	 * Returns the unsubscribe; the last one stops the minute's check.
	 */
	onDayChange(listener: (change: DayChange) => void, ready?: () => boolean): () => void;
	/** A minute's check that waited for a listener to be ready runs now; without one waiting, nothing happens. */
	catchUp(): void;
}

/** What a step back or forward did: changed the file, found nothing to do, or found its lines edited since and left the file as it is. */
export type UndoOutcome = "done" | "nothing" | "conflict";

/**
 * The plugin's own changes of the tasks file, one step per action, taken back and done again. Edits by hand and through
 * Sync are not steps; taking a step back leaves them as they are. The steps live while the plugin does.
 */
export interface UndoService {
	undo(): Promise<UndoOutcome>;
	redo(): Promise<UndoOutcome>;
	canUndo(): boolean;
	canRedo(): boolean;
	/** Fires when a step is added, taken back or done again. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

export type CalendarSource = "google" | "iphone" | "work";

export interface CalendarEvent {
	readonly id: string;
	readonly title: string;
	readonly start: Date;
	readonly end: Date;
	readonly allDay: boolean;
	readonly calendar: string;
	/** `#RRGGBB` as the calendar's file gives it; null when it gives none, and the frontend picks the source's own. */
	readonly color: string | null;
	readonly source: CalendarSource;
	/** The calendar's account as its writer knows it (an email for Google and Exchange); null when the writer does not say. */
	readonly account: string | null;
	/** The writer's own id of the calendar (Google's calendar id, iOS's calendarIdentifier); null when it does not say. */
	readonly calendarId: string | null;
}

/** `synced`: the plugin fetches it itself (Google); `exported`: a file another device exports (the work calendar from the iPhone). */
export type SourceKind = "synced" | "exported";

/**
 * Why a source has nothing fresh: Google not logged in, its file not in the vault, a feed silent for `seconds`, or any
 * other failure with the source's own text. The frontend words it.
 */
export type SourceProblem =
	| { readonly kind: "loggedOut" }
	| { readonly kind: "fileMissing" }
	| { readonly kind: "noAnswer"; readonly seconds: number }
	| { readonly kind: "failed"; readonly detail: string };

export interface SourceStatus {
	readonly source: CalendarSource;
	readonly kind: SourceKind;
	/** Null while the source is fine. */
	readonly problem: SourceProblem | null;
	/** How many of the day's events shown come from it. */
	readonly events: number;
	/** When this source's data was last fetched successfully (for the work file: its exportedAt). */
	readonly updatedAt: Date | null;
	/** How the calendar date of `updatedAt` stands to the clock's (calendar days, not the plugin's day); null with no `updatedAt`. The words are the frontend's. */
	readonly updatedDay: DayRelation | null;
	/** The calendar date of `updatedAt` by the clock (not the plugin's day), the date shown for an update before yesterday; null with no `updatedAt`. */
	readonly updatedDate: LocalDate | null;
	/** The work file's `device` ("iPhone"); nothing for Google. */
	readonly detail: string | null;
	/** `updatedAt` older than `settings.staleAfterMinutes`, or a problem: the orange dot. */
	readonly stale: boolean;
}

export interface DayEvents {
	readonly events: readonly CalendarEvent[];
	/** Of `events`, those of the whole day: the rows over the timeline. */
	readonly allDay: readonly CalendarEvent[];
	/** Of `events`, those on a time: the timeline. */
	readonly timed: readonly CalendarEvent[];
	readonly statuses: readonly SourceStatus[];
	/** A calendar shown on the day comes from a file no longer fresh: the orange dot, Refresh now would help. */
	readonly stale: boolean;
}

/** A calendar some writer's file lists, by account and title, and whether the plugin shows it. */
export interface ShownCalendar {
	/** With `title`, the calendar's key: what `setShown` takes back. */
	readonly account: string;
	readonly title: string;
	/** The heading the calendar is listed under: its account, or iPhone for the phone's own calendars no account names. */
	readonly accountName: string;
	/** The calendar's name as listed under that heading. */
	readonly name: string;
	readonly color: string | null;
	readonly shown: boolean;
}

/**
 * Why the screen wants a day's events. `open`: the day opens on the screen, its events fetched with the days next to it,
 * one request per source, so a swipe finds them ready; a source polled over the network that answered for the day less
 * than the refresh interval ago is not asked again. `peek`: a day drawn in under the finger, fetched as on `open` only
 * when nothing was ever fetched for it. `refresh`: the polling, Refresh now, a source that changed: both sources afresh
 * for the day alone.
 */
export type EventsReason = "open" | "peek" | "refresh";

/** A day's events as the screen gets them: the last ones at once, the fresh ones when it starts the fetch. */
export interface DayEventsAsk {
	/** The events last fetched for the day, staleness counted from now; null when none were. */
	readonly cached: DayEvents | null;
	/** Starts the fetch the reason calls for; null when the cached events are enough. */
	readonly fresh: (() => Promise<DayEvents>) | null;
}

/** Events of both sources for one day. A failing source keeps its last good events and reports the error. */
export interface CalendarService {
	/** The day's events for `reason`: the cached ones and how to fetch them afresh. Nothing is fetched until `fresh` is called. */
	events(date: LocalDate, reason: EventsReason): DayEventsAsk;
	/** The event is over by the clock now: it is drawn grey. Asked at every drawing, so it greys as it ends. */
	isPast(event: CalendarEvent): boolean;
	/** Fires when a source's data changed by itself (the work file arrived), so a fetch now would bring news. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
	/** Polls every refresh interval of the settings while the screen is on view, from now until `stop`. */
	keepFresh(screen: PolledScreen): CalendarPoll;
	/** Every calendar the files list, Google's first, each once. A new one is shown. */
	known(): Promise<readonly ShownCalendar[]>;
	setShown(account: string, title: string, shown: boolean): Promise<void>;
}

/** What the polling asks of the screen. */
export interface PolledScreen {
	/** Fetches the shown day's events afresh and shows them. */
	refresh(): Promise<void>;
	/** The screen is not on view: the document hidden or its tab behind another. Read at every tick. */
	hidden(): boolean;
}

/**
 * The events kept fresh while the screen is on view: a fetch every interval, and one when the app or the window comes
 * back unless the last is under half an interval old. A tick missed off screen is fetched when the screen is back.
 */
export interface CalendarPoll {
	/** The window got the focus or the app came to the front. */
	wake(): void;
	/** The screen is on view again: the tick it missed is fetched now. */
	catchUp(): void;
	/** Refresh now: asks the phone for fresh work events, then fetches at once. */
	refreshNow(): Promise<void>;
	stop(): void;
}

/** The Google account as the settings tab sees it: logged in or not. Which calendars show is CalendarService's. */
export interface GoogleAccount {
	isLoggedIn(): boolean;
	/** Opens the browser for Google's consent; the token syncs to the other devices. */
	login(): Promise<string>;
	logout(): Promise<void>;
}

/** What the work calendar needs set up by hand: the Scriptable script, and the export on the phone. */
export interface WorkCalendarSetup {
	/** The script to paste into Scriptable. */
	scriptableLoader(): string;
	/** Asks the phone for fresh work events. */
	export(): void;
}

/**
 * What a screen reads of the shared settings: the path, the names and the levels it draws, when a touch becomes a drag
 * and the hour a day opens at. How a frontend lays out its own screen is its own settings, not these.
 */
export interface ScreenSettings extends ScreenBehaviour {
	readonly tasksFile: string;
	readonly sections: SectionNames;
	/** The heading over tasks outside any section. */
	readonly ungrouped: string;
	readonly priorities: readonly PriorityLevel[];
	readonly labels: readonly LabelLevel[];
}

/** The shared settings as a screen sees them. */
export interface ScreenSettingsStore {
	/** The same object while the settings stay the same. */
	get(): ScreenSettings;
	/** Fires after the settings changed, here or through Sync. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/** The marks of a task line the settings tab sets. */
export type Marker = "dueDateMarker" | "slotMarker" | "alarmSlotMarker" | "liveSlotMarker" | "silentSlotMarker" | "repeatMarker" | "collapsedMarker";
/** The settings typed as a count: milliseconds, an hour, minutes, seconds. */
export type CountField = "longPressMs" | "scrollToHour" | "staleAfterMinutes" | "refreshSeconds";
/** The settings tab's fields as it shows them: no secret of Google's among them. */
export interface SettingsForm {
	readonly tasksFile: string;
	readonly sections: SectionNames;
	/** The sections' names the tab edits, in the order it shows them. */
	readonly sectionOrder: readonly (keyof SectionNames)[];
	readonly markers: Readonly<Record<Marker, string>>;
	/** The line markers the tab edits, in the order it shows them. */
	readonly markerOrder: readonly Marker[];
	readonly priorities: readonly PriorityLevel[];
	readonly labelTag: string;
	readonly labels: readonly LabelLevel[];
	readonly presets: readonly string[];
	readonly ungrouped: string;
	readonly longPressMs: number;
	readonly dayStartHour: number;
	readonly scrollToHour: number;
	readonly staleAfterMinutes: number;
	readonly googleClientId: string;
	readonly refreshSeconds: number;
	readonly workCalendarFile: string;
	/** The hours a day may start at, in order: Day starts at offers them. */
	readonly dayStartHours: readonly number[];
	/** A client id is filled in, so Log in can open Google; without one the account asks for it first. */
	readonly googleClientReady: boolean;
}

/** A field the service fills with a secret and takes typed text from: the UI never asks for the secret. */
export interface SecretField {
	setValue(value: string): void;
	onChange(listener: (value: string) => void): void;
}

/**
 * The settings tab's commands: each checks its value against the settings of this moment, and writes nothing on a bad
 * one. A level or a preset is changed in the levels or presets as they are saved then, so one edit never undoes the one
 * before it.
 */
export interface SettingsService {
	form(): SettingsForm;
	setTasksFile(path: string): Promise<void>;
	setSection(key: keyof SectionNames, name: string): Promise<void>;
	setMarker(marker: Marker, text: string): Promise<void>;
	/** Written when the text reads as a number of zero or more. */
	setCount(field: CountField, text: string): Promise<void>;
	setDayStartHour(hour: number): Promise<void>;
	/** The prefix trimmed. */
	renameLevel(index: number, prefix: string): Promise<void>;
	recolourLevel(index: number, color: PriorityColor): Promise<void>;
	removeLevel(index: number): Promise<void>;
	/** The next `p<n>` no level has, in the first colour no level has. */
	addLevel(): Promise<void>;
	/** The level at `from` goes to `to`, the others keeping their order. */
	moveLevel(from: number, to: number): Promise<void>;
	/** The tag folder trimmed; written when it is one word. */
	setLabelTag(tag: string): Promise<void>;
	/** The name as shown, its spaces written as underscores. */
	renameLabel(index: number, title: string): Promise<void>;
	recolourLabel(index: number, color: PriorityColor): Promise<void>;
	removeLabel(index: number): Promise<void>;
	/** A new label `Label_<n>` no label has, in the first colour no label has. */
	addLabel(): Promise<void>;
	moveLabel(from: number, to: number): Promise<void>;
	/**
	 * A code typed for a level's or a label's colour, read with the shade each preset takes on the frontend's screen now: a
	 * preset's own shade is that preset, so it keeps its other shade; any other code is itself. Null for text that is no colour.
	 */
	colourOf(text: string, shades: Readonly<Record<PresetColor, string>>): PriorityColor | null;
	/**
	 * A code typed for the colour of level or label `index` and left: the colour to write (`colourOf`), or null when it is
	 * no colour or the one it has already; the field then shows its colour's code again.
	 */
	typedColour(of: "level" | "label", index: number, text: string, shades: Readonly<Record<PresetColor, string>>): PriorityColor | null;
	/** The name trimmed. */
	renamePreset(index: number, name: string): Promise<void>;
	removePreset(index: number): Promise<void>;
	/** An empty preset at the end. */
	addPreset(): Promise<void>;
	/** The preset at `from` goes to `to`, the others keeping their order. */
	movePreset(from: number, to: number): Promise<void>;
	/** The name trimmed; a blank one is the default. */
	setUngrouped(name: string): Promise<void>;
	setGoogleClientId(id: string): Promise<void>;
	/** The saved client secret goes into the field, and what is typed there is saved. */
	bindClientSecret(field: SecretField): void;
	setWorkCalendarFile(path: string): Promise<void>;
}

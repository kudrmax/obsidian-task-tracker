import type { GroupName, LocalDate, ReminderKind, SectionKey, Slot, TaskStatus } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import type { EndList, GroupedList, GroupPlace } from "../domain/Lists";
import type { Placement, TaskDraft } from "../domain/Placement";
import type { PriorityLevel } from "../domain/Priority";
import type { DayColumn } from "../domain/Days";
import type { DayBoundary } from "../domain/DayBoundary";
import type { SectionOffer } from "./sections";

export type { GroupName, ReminderKind, SectionKey };
export type { RepeatRule, RepeatUnit, Weekday } from "../domain/Repeat";
/** Whether two rules are the same but for where they are anchored: the UI asks, never compares rules itself. */
export { sameRule } from "../domain/Repeat";
/** Where a day begins: the UI places slots, events and now on the timeline by it. */
export { DayBoundary } from "../domain/DayBoundary";
/** Whether two placements are the same place: the same kind, and for a date the same day. */
export { samePlacement } from "../domain/operations";
/** How the UI tells tasks apart by their keys: the same place, the same line, one task with its subtasks, an id. */
export { keyId, sameLine, samePlace, sameTaskTree } from "./taskKeys";
/** Where a card may go among cards with levels, and what a gap among them means: the nesting rules of the file. */
export { fitLevel, gapOfPlace, levelRange, placeOfGap, shiftLevel, type GapPlace, type LevelCard, type ListCard, type ListPlace } from "./nesting";
/** A list in its sections, and whether it shows their headers. */
export { listView, type ListGroup, type ListView } from "./sections";
/** Where in its list's sections a task, or several, can go from a menu, by the sections offered with the screen. */
export { sectionChoice, type SectionChoice, type SectionOffer } from "./sections";
/** A task's text cut into text and links, or plain, each link by its word. */
export { plainText, textParts, type TextPart } from "../domain/TaskText";
/** The hour's heights the settings tab writes and reads as text. */
export type { ZoomLevel } from "../settings";
/** A priority level, its colours in the order the settings offer them. */
export { PRIORITY_COLORS, type PriorityColor, type PriorityLevel } from "../domain/Priority";
export type { DayColumn, EndList, GroupedList, GroupPlace, Placement, TaskDraft };

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
	readonly status: TaskStatus;
	readonly dueDate: LocalDate | null;
	readonly slot: Slot | null;
	/** How the phone reminds of the task at its slot's start; a task without a slot keeps the default. */
	readonly reminder: ReminderKind;
	/** The rule after the task's repeat marker; null for a task that does not repeat. */
	readonly repeat: RepeatRule | null;
	/** Not done and not given up: todo or in progress. */
	readonly open: boolean;
	/** The task may be given a rule: an open task of its own; a subtask goes with its parent, and a closed task repeats no more. */
	readonly repeatable: boolean;
	/** The level whose prefix starts the task's text, which `text` then goes without. */
	readonly priority: PriorityLevel | null;
	/** The section of its list it sits in; null outside any. */
	readonly group: GroupName;
	/** The list the task is in, its task's for a subtask. */
	readonly list: SectionKey;
	/** It sits under another task. */
	readonly isSubtask: boolean;
	/** The day the task stands on: its slot's, today for Now, else its due date. */
	readonly day: LocalDate | null;
	/** What may be done to it: put off (not a done task), its due date taken off (one it has, not today's). */
	readonly can: { readonly postpone: boolean; readonly removeDue: boolean };

	/** The open subtasks right under this one, in file order, each with its own. */
	readonly subtasks: readonly TaskItem[];
	/** Null without subtasks. */
	readonly progress: SubtaskProgress | null;
	/** The text of the task a subtask belongs to; null for a task. */
	readonly parentText: string | null;
	/** Its nested lines without a checkbox as Markdown, its first level unindented; null without any. */
	readonly description: string | null;
}

/** A piece of a found task's title; `match` marks the words searched for. */
export interface TitlePart {
	readonly text: string;
	readonly match: boolean;
}

/** A line of a found task's description: the words searched for and some around them. */
export interface SnippetParts {
	readonly before: string;
	readonly match: string;
	readonly after: string;
}

/** A task the search found: its title cut around the match (empty when the title has none), the description's line (null when it has none). */
export interface SearchHit {
	readonly item: TaskItem;
	readonly title: readonly TitlePart[];
	readonly description: SnippetParts | null;
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

/** One change `applyAll` makes to a task: each kind does what the single call of that name does. */
export type TaskChange =
	| { readonly kind: "status"; readonly status: TaskStatus }
	| { readonly kind: "priority"; readonly priority: string | null }
	| { readonly kind: "dueDate"; readonly date: LocalDate | null }
	| { readonly kind: "postpone"; readonly date: LocalDate }
	| { readonly kind: "remove" }
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
export type DropColumn = "left" | "soon" | "inbox" | "backlog";
/** Where a task that exists is dragged from. */
export type DropFrom = DropColumn | "timeline";
/** Where a drag begins: a task's place, or "new" for the plus that carries a task not yet written. */
export type DropOrigin = DropFrom | "new";

/** Where a task is let go, as the gesture found it. */
export type DropTo =
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "clearSlot" }
	/** A gap of a list that shows no sections: right before `before`, or at the end (null). */
	| { readonly kind: "list"; readonly column: DropColumn; readonly before: TaskKey | null }
	/** A gap of a list that shows sections: right before `before`, or at the end of `group`; `date`, the later day of the column. */
	| { readonly kind: "group"; readonly list: GroupedList; readonly date: LocalDate | null; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null };

/** A task let go, and where it was dragged from. */
export interface DroppedTask {
	readonly key: TaskKey;
	readonly from: DropFrom;
}

/** Whether a target takes the tasks carried from these places, and whether a list shows where in it a task goes or puts it at its end. */
export { acceptsDrop, placesInGap } from "./drops";

/**
 * Everything the UI does with tasks. Every mutating call reads the file afresh, applies one operation, writes once,
 * then runs the normalization rules. Rejects with StaleTaskError when `key.raw` no longer matches.
 */
/** A call that takes the last task out of a section takes the section away; a section left empty any other way stays. */
export interface TaskService {
	/** The levels that mark tasks, in the settings' order: one-word prefixes, the first of two alike. */
	priorityLevels(): readonly PriorityLevel[];
	/** The level a typed title starts with and the title without it, as the file will read it. */
	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null };
	/** Nothing to write: no text, or a level's prefix alone. */
	isBlank(text: string): boolean;
	/** `text` with `prefix` first in place of the one it had; null takes it off. */
	withPriority(text: string, prefix: string | null): string;

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
	 * The tasks the screen draws whose title or description holds the query, case and «ё» aside: Inbox, Backlog, Soon,
	 * Now, Done, each in file order, a task before its open subtasks. A query of spaces finds nothing.
	 */
	search(query: string): Promise<readonly SearchHit[]>;

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
	 * level's prefix or null; whitespace-only text creates nothing. `repeat` is set as `setRepeat` sets it, in the same write, on a task of its own only: a subtask or a slot takes none.
	 * One write per call. Gives the new task's key as the file stands after the write, wherever its rules put it (a schedule
	 * takes an Inbox task to Soon); null when nothing was created.
	 */
	createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null): Promise<TaskKey | null>;

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
	 * `createSubtask`.
	 */
	edit(key: TaskKey, draft: TaskDraft): Promise<void>;
	/** The placement the sheet shows for a task: `now` when it is due today, `date` when it has another due date, else its section (a subtask's is its task's). */
	placementOf(item: TaskItem): Placement;
	/** What the day column stands for on `date`: today is Now with its sections, a later day Soon with that day, a past day Now with that day and no sections. */
	dayColumn(date: LocalDate): DayColumn;
	/** The placement of a task for `date`: `now` for today, else `date`. */
	placementOfDay(date: LocalDate): Placement;
	/** The day a placement puts a task on: today for `now`, its day for `date`, none for a list. */
	dayOfPlacement(placement: Placement): LocalDate | null;

	setStatus(key: TaskKey, status: TaskStatus): Promise<void>;
	setDueDate(key: TaskKey, date: LocalDate | null): Promise<void>;
	/** A level's prefix first in the task's text, in place of the one it had; null takes it off. */
	setPriority(key: TaskKey, priority: string | null): Promise<void>;
	/** How the phone reminds of a task on a time: the marker before its slot. */
	setReminder(key: TaskKey, reminder: ReminderKind): Promise<void>;
	/**
	 * Sets or replaces the task's repeat rule; null takes it off. A schedule on an undated task gives it the first suitable
	 * day as its due date, and the rule is anchored at the task's day. Closing a task that repeats writes its next copy in the same write.
	 */
	setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void>;
	/** Stops a repeating task: the rule goes and the task is done, with no next copy. */
	stop(key: TaskKey): Promise<void>;
	rename(key: TaskKey, text: string): Promise<void>;
	/**
	 * The description from Markdown, one block right under the task and before its subtasks; the same text writes
	 * nothing, an empty one takes it away. Blank lines go: they would end the task in the file.
	 */
	setDescription(key: TaskKey, markdown: string): Promise<void>;
	remove(key: TaskKey): Promise<void>;
	/** The task's line in the file, from 0, once the file is normalized: where Open in Obsidian puts the cursor. */
	lineOf(key: TaskKey): Promise<number>;

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
	 * `createGroup` takes a name; a task of Soon keeps its due date. One task as `moveToGroup` or `createGroup`, several as
	 * one `applyAll`. The section a task stands in already is no exception: it goes to its end.
	 */
	toSection(keys: readonly TaskKey[], name: GroupName): Promise<void>;
	/** A lifted section let go (sections spec §5.4); No section moves too. */
	moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Promise<void>;
	/** A blank name changes nothing; a name the list has merges the two; the No section name hands the tasks to it. */
	renameGroup(list: GroupedList, group: string, name: string): Promise<void>;
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
	 * task from another column at its end (see `placesInGap`).
	 */
	drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void>;

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
export interface DayService {
	today(): LocalDate;
	/** Where a day begins: the timeline places slots, events and now by it. */
	boundary(): DayBoundary;
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

/** `synced`: the plugin fetches it itself (Google); `exported`: a file another device exports (the work calendar from the iPhone). */
export type SourceKind = "synced" | "exported";

export interface SourceStatus {
	readonly source: CalendarSource;
	readonly kind: SourceKind;
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
	/** Fires when a source's data changed by itself (the work file arrived), so a fetch now would bring news. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
	/** Polls every refresh interval of the settings while the screen is on view, from now until `stop`. */
	keepFresh(screen: PolledScreen): CalendarPoll;
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

/** A calendar of the Google account, as the settings tab lists it. */
export interface CalendarOption {
	readonly id: string;
	readonly title: string;
	readonly color: string;
}

/** The Google account as the settings tab sees it: logged in or not, and which of its calendars the timeline shows. */
export interface GoogleAccount {
	isLoggedIn(): boolean;
	/** Opens the browser for Google's consent; the token syncs to the other devices. */
	login(): Promise<string>;
	logout(): Promise<void>;
	/** Asked afresh each time. */
	listCalendars(): Promise<readonly CalendarOption[]>;
	/** Shown calendar ids: empty means every calendar selected in Google. */
	setShown(all: readonly CalendarOption[], id: string, shown: boolean): Promise<void>;
	isShown(id: string): boolean;
}

/** What the work calendar needs set up by hand: the Scriptable script, and the export on the phone. */
export interface WorkCalendarSetup {
	/** The script to paste into Scriptable. */
	scriptableLoader(): string;
	/** Asks the phone for fresh work events. */
	export(): void;
}

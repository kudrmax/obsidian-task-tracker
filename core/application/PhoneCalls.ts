import type { DayBoundary } from "../domain/DayBoundary";
import { GROUPED_LISTS } from "../domain/Lists";
import { dayRelation } from "../domain/Days";
import { addDays, MINUTES_PER_DAY, minutesToHHMM } from "../domain/LocalDate";
import { DESCRIPTION_TEMPLATE } from "../domain/description";
import { isPresetColor, PRIORITY_COLORS, usableColor } from "../domain/Priority";
import { labelTitle, sameLabels } from "../domain/Label";
import { sameRule, repeatParts } from "../domain/Repeat";
import { editRepeat, repeatDraft } from "../domain/RepeatDraft";
import { nextProgress, REMINDER_KINDS, sameSlot } from "../domain/Task";
import { textParts } from "../domain/TaskText";
import { oneLine } from "../domain/TaskTitle";
import { samePlacement } from "../domain/operations";
import { CARD_GAPS, CARD_HEIGHTS, DEFAULT_CARD_SIZE, sameLevels, settingsFrom, type TaskCalendarSettings } from "../settings";
import { CalendarDay, type CalendarReading } from "./calendarDay";
import { CALENDAR_SOURCES, type CalendarFile, calendarPath, readCalendarFile } from "./calendarFile";
import { captureTitle } from "./captureTitle";
import { cardDue } from "./cardDue";
import { dayMonth, dayTitle, dueLabel } from "./dayLabels";
import { eventLevels } from "./eventLevels";
import { durationParts, eventLeft, overlayLeft, stackCorner, stackTasks, timeParts } from "./timelineStack";
import { bgAlphaFor, contrast, EVENT_BG_ALPHA, eventColors, eventHex, inkOf, pastEventPaint, shadesOf } from "./paints";
import { placeShowing, SCREEN_PLACES, type ScreenAt, SHOWN_LISTS, stepScreen } from "./screenPlaces";
import { DEFAULT_ZOOM_HOUR, DEFAULT_ZOOM_LEVELS, formatZoomLevels, gridAt, gridMarks, labelHidesNearNow, levelsFor, parseZoomLevels, zoomAfterPinch, zoomLevelsOf, zoomShown } from "./timelineZoom";
import {
	type CalendarEvent,
	type CalendarSource,
	type DayEvents,
	type DropColumn,
	type GroupedList,
	type GroupingState,
	type ProjectNote,
	StaleTaskError,
	type SourceProblem,
	type SourceStatus,
	type TaskKey,
	TasksFileMissingError,
} from "./contracts";
import { acceptsDrop, placesInGap } from "./drops";
import { branchOf, carriedMiddle, gapBranch, levelAt, placeAt } from "./listDrop";
import { grownStart, wholeWidth } from "./wholeCard";
import { onTheDay, REPEAT_WORDS, repeatValue } from "./repeatWords";
import { canPick } from "./menus";
import { DIVIDER_SNAP, dividerAt, LIST_WIDTHS, listShareOf, listWidths } from "./listWidth";
import { type LinkQuery, linkQuery, noteOfLink, noteSuggestions, type VaultNote, withNoteLink } from "./notes";
import { fitLevel, gapAt, gapOfPlace, groupPlaceOf, type Header, levelRange, type ListCard, placeOfDrop, placeOfGap, sameGap, shiftLevel } from "./nesting";
import type { Clock, SettingsStore } from "./ports";
import { emptySession, type EntryJob, type EntryLook, type EntrySession, type EntryState, type PendingRename, QuickEntry } from "./QuickEntry";
import { sectionNameEnd } from "./SectionNameEntry";
import { screenSettingsOf } from "./ScreenSettingsImpl";
import { SettingsServiceImpl } from "./SettingsServiceImpl";
import { listView, sectionChoice } from "./sections";
import { projectNotesOfTexts, revealedGrouping, withFoldToggled, withGrouping } from "./projects";
import { noteTags } from "../domain/NoteTags";
import { keyId, sameLine, samePlace, sameTaskTree } from "./taskKeys";
import { MOST_CARD_COLORS } from "./marks";
import { type Read, type Snapshot, TaskReads } from "./TaskReads";
import { type Operation, TaskRules } from "./TaskRules";
import { TaskReminders } from "./TaskReminders";
import { TaskWrites, type Write } from "./TaskWrites";
import { type UndoState, UndoSteps, type UndoWay } from "./UndoSteps";
import { NO_TASK_IDS, TaskIdentity, type TaskIdState } from "./TaskIdentity";
import type { PatchIds } from "../domain/TextPatch";
import { snapMinute } from "./snapGrid";
import { dayOpening } from "./DayServiceImpl";
import { repeatPageEnd } from "./RepeatPage";
import { descriptionOpen, descriptionRead, descriptionSave, descriptionTyped } from "./DescriptionDraft";

/**
 * What one call of the door reads: the files' texts as the host has them now, the plugin's settings and the moment. The
 * door keeps nothing between calls: what a host keeps (the history of steps, a quick entry's session) it hands in again.
 */
export interface DoorContext {
	/** The tasks file's text; null when there is no tasks file (`tasksFile` says where it is). */
	readonly tasks: string | null;
	/** The plugin's `data.json`, as text; empty or left out for the defaults. */
	readonly settings?: string;
	/** The moment of the call, epoch milliseconds. */
	readonly nowMs: number;
	/** The calendars' files' texts (`calendarFile` says where each is); a source left out or null has no file. */
	readonly calendars?: Partial<Record<CalendarSource, string | null>>;
	/** The calendar sources the host fetches itself, their files' device saying nothing; Google's alone when left out. */
	readonly fetched?: readonly CalendarSource[];
	/** The steps of undo as the door last answered them; none before the first. */
	readonly history?: UndoState;
	/** The notes with the project tag (`ProjectNote`); none when left out: a task's project then comes from its own field alone. */
	readonly projects?: readonly ProjectNote[];
	/** How this device groups its lists by project, as the door last answered it; the defaults when left out. */
	readonly grouping?: GroupingState;
	/** Who the tasks are (`TaskItem.id`), as the door last answered it; left out before the first: every task a new id. */
	readonly ids?: TaskIdState;
}

/** A call's answer: the result, and what the host writes back; or the error, by its code. */
export type DoorAnswer =
	| {
			readonly ok: true;
			readonly result: unknown;
			/** The tasks file's new text: the host writes it (only if the file still holds the text it handed in). */
			readonly tasks?: string;
			/** The write is a step undo takes back; normalizing the file is none. */
			readonly step?: boolean;
			/** The history of steps after this call: the host keeps it and hands it in again. */
			readonly history?: UndoState;
			/** The new `data.json` text: the host writes it. */
			readonly settings?: string;
			/** The device's grouping after this call: the host keeps it and hands it in again. */
			readonly grouping?: GroupingState;
			/** Who the tasks are after this call: the host keeps it and hands it in again, so a task keeps its id. */
			readonly ids?: TaskIdState;
	  }
	| { readonly ok: false; readonly error: { readonly code: DoorErrorCode; readonly message: string } };

/**
 * `staleTask`: a task or section the call names is no longer there as read. `tasksFileMissing`: the call needs the tasks
 * file. `blank`: a task to write has no title.
 */
export type DoorErrorCode = "staleTask" | "tasksFileMissing" | "blank" | "unknownMethod" | "badArguments" | "failed";

/** A reminder on the wire: the task's line as its id, times in epoch milliseconds. */
export interface WireReminder {
	/** The task's line as read: an action finds the task by it. */
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly kind: "notification" | "alarm" | "live";
	/** The slot's date, `YYYY-MM-DD`. */
	readonly date: string;
	readonly startMs: number;
	readonly dayEndMs: number;
}

/** A timed meeting on the wire, times in epoch milliseconds. */
export interface WireMeeting {
	readonly title: string;
	readonly startMs: number;
	readonly endMs: number;
}

/** A calendar event on the wire: times in epoch ms, and whether it is over at the call's moment. */
export interface WireEvent extends Omit<CalendarEvent, "start" | "end"> {
	readonly startMs: number;
	readonly endMs: number;
	readonly past: boolean;
}

export interface WireStatus extends Omit<SourceStatus, "updatedAt"> {
	readonly updatedAtMs: number | null;
}

export interface WireDayEvents {
	readonly events: readonly WireEvent[];
	readonly allDay: readonly WireEvent[];
	readonly timed: readonly WireEvent[];
	readonly statuses: readonly WireStatus[];
	readonly stale: boolean;
}

/** The screen as a quick entry reads it, on the wire: each list's cards and sections, and which lists show. */
export interface WireLook {
	readonly cards: Partial<Record<DropColumn, readonly ListCard[]>>;
	readonly sections?: Partial<Record<DropColumn, readonly Header[]>>;
	readonly sectioned?: Partial<Record<DropColumn, boolean>>;
	/** The day the day's list shows. */
	readonly day: string;
	/** The lists the screen shows, in its order. */
	readonly shown: readonly DropColumn[];
	/** The project whose own view the screen is (`ProjectRef.link`); left out for the main screen. */
	readonly project?: string;
}

class DoorError extends Error {
	constructor(
		readonly code: DoorErrorCode,
		message: string,
	) {
		super(message);
	}
}

/** The plugin's settings from its `data.json`, or the defaults for nothing. */
export function settingsOf(json: string): TaskCalendarSettings {
	return settingsFrom(json.trim() === "" ? null : JSON.parse(json));
}

/** What a call ended with besides its result. */
interface Effects {
	tasks?: string;
	step?: boolean;
	history?: UndoState;
	settings?: string;
	grouping?: GroupingState;
	ids?: TaskIdState;
}

/** One call's world: the rules under the settings given, at the moment given, over the texts given. */
class Call {
	/** The settings as they stand in this call: those handed in, with what the call changed. */
	private current: TaskCalendarSettings;
	/** What the call changed of the settings, every key it wrote. */
	private changed: Partial<TaskCalendarSettings> = {};
	readonly store: SettingsStore;
	readonly rules: TaskRules;
	readonly reads: TaskReads;
	readonly writes: TaskWrites;
	private readonly kept: Effects = {};
	readonly clock: Clock;
	/** Who the tasks are: handed in, carried through the call's writes. */
	private readonly identity: TaskIdentity;
	private text: string | null;
	/** `data.json` as handed in: what a change of the settings is written over. */
	private readonly settingsText: string;

	constructor(readonly context: DoorContext) {
		this.settingsText = context.settings ?? "";
		this.current = settingsOf(this.settingsText);
		const clock: Clock = { now: () => new Date(context.nowMs) };
		this.clock = clock;
		const store: SettingsStore = {
			get: () => this.current,
			update: async (patch) => this.saveSettings(patch),
			onChange: () => () => undefined,
		};
		this.store = store;
		this.identity = new TaskIdentity(context.ids);
		this.rules = new TaskRules(store, clock, this.identity, context.ids !== undefined);
		this.reads = new TaskReads(this.rules, store, clock, { notes: () => context.projects ?? [], grouping: () => this.grouping });
		this.writes = new TaskWrites(this.rules, this.reads);
		this.text = context.tasks ?? null;
	}

	/** What the call ended with besides its result: the identity of the tasks when it changed. */
	get effects(): Effects {
		const ids = this.identity.state;
		return ids === (this.context.ids ?? NO_TASK_IDS) ? this.kept : Object.assign(this.kept, { ids });
	}

	/** The device's grouping as this call has it: handed in, with what the call changed. */
	get grouping(): GroupingState {
		return this.effects.grouping ?? this.context.grouping ?? {};
	}

	/** A change of the device's grouping: the answer carries it for the host to keep. */
	keepGrouping(state: GroupingState): void {
		if (state !== this.grouping) this.effects.grouping = state;
	}

	get settings(): TaskCalendarSettings {
		return this.current;
	}

	get now(): Date {
		return new Date(this.context.nowMs);
	}

	/** The tasks file's text as this call has it now: a write earlier in the call already in it. */
	tasks(): string {
		if (this.text === null) throw new TasksFileMissingError(this.settings.tasksFile);
		return this.text;
	}

	hasTasks(): boolean {
		return this.text !== null;
	}

	snapshot(): Snapshot {
		const at = this.rules.moment();
		const text = this.tasks();
		return { text, doc: this.rules.read(text, at).doc, today: at.today, boundary: at.boundary };
	}

	/** A read as it asks: the file tidied first, read, or missing. */
	ask<R>(read: Read<R>): R {
		if (read.tidies) this.normalize();
		if (!read.reads) return read.answer(null);
		if (!this.hasTasks() && read.missing) return read.missing();
		return read.answer(this.snapshot());
	}

	/** The file tidied for today, as the plugin's service writes it before a screen: no step. */
	normalize(): void {
		if (this.text === null || !this.rules.read(this.text).changed) return;
		this.setText(this.rules.change(this.text, (d) => d).text, false);
	}

	/**
	 * A text the call writes as one action, made of the text it has by the rules: a step of the history, which keeps who
	 * the tasks were on each side. False when `make` writes nothing (null).
	 */
	write(make: (text: string) => string | null): boolean {
		const before = this.tasks();
		const was = this.rules.idsOf(before);
		const text = make(before);
		if (text === null) return false;
		this.setText(text, true, { before: was, after: this.rules.idsOf(text) });
		return true;
	}

	/** A write as one action: its operation over the text, the new text a step of the history. */
	run<R>(write: Write<R>): R {
		const operation = write.operation;
		if (!operation) return write.answer(null);
		let change = null as ReturnType<TaskRules["change"]> | null;
		this.write((text) => (change = this.rules.change(text, operation)).text);
		return write.answer({ before: change!.before, after: change!.after });
	}

	/** The tasks text a step back or forward leaves; its tasks keep who they were: read before the step, and after it for the answer's ids. */
	undo(way: UndoWay): string {
		const steps = new UndoSteps(this.context.history);
		const before = this.tasks();
		this.rules.idsOf(before);
		const { outcome, text, carried } = steps.step(way, before);
		this.effects.history = steps.state;
		if (carried) {
			this.identity.carried(before, text, carried);
			this.rules.idsOf(text);
		}
		if (text !== this.text) this.setText(text, false);
		return outcome;
	}

	/** A change of the settings, at once: the rest of the call reads it, and the answer's `data.json` has it, every other key kept, written as Obsidian writes it. */
	saveSettings(patch: Partial<TaskCalendarSettings>): void {
		this.current = { ...this.current, ...patch };
		this.changed = { ...this.changed, ...patch };
		const raw = this.settingsText.trim() === "" ? {} : (JSON.parse(this.settingsText) as Record<string, unknown>);
		this.effects.settings = JSON.stringify({ ...raw, ...this.changed }, null, 2);
	}

	private setText(text: string, step: boolean, ids?: PatchIds): void {
		const before = this.text;
		if (text === before) return;
		this.text = text;
		this.effects.tasks = text;
		if (!step) return;
		const steps = new UndoSteps(this.effects.history ?? this.context.history);
		if (before !== null && steps.record(before, text, ids)) {
			this.effects.step = true;
			this.effects.history = steps.state;
		}
	}
}

type Handler = (call: Call, args: unknown[]) => unknown;
type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const KEPT = (call: Call): Snapshot => call.snapshot();

/** An optional project's part: left out, the whole list; `null`, the tasks of no project. */
function scopeOf(args: readonly unknown[], at: number): string | null | undefined {
	return args.length > at ? ((args[at] ?? null) as string | null) : undefined;
}

/** Every TaskService method a frontend calls, by name, over the call's text. */
const TASKS: Readonly<Record<string, Handler>> = {
	priorityLevels: (c) => c.reads.priorityLevels(),
	labelLevels: (c) => c.reads.labelLevels(),
	parseTitle: (c, [text]) => c.reads.parseTitle(text as string),
	isBlank: (c, [text]) => c.reads.isBlank(text as string),
	withPriority: (c, [text, prefix]) => c.reads.withPriority(text as string, (prefix ?? null) as string | null),
	draftMarks: (c, [text, priority, labels]) => c.reads.draftMarks(text as string, (priority ?? null) as string | null, (labels ?? []) as string[]),
	screen: (c, [date, project]) => c.ask(c.reads.screenRead(date as string, (project ?? undefined) as string | undefined)),
	dayView: (c, [date]) => c.reads.dayView(KEPT(c), date as string),
	soonWithoutDateView: (c) => c.reads.soonWithoutDateView(KEPT(c)),
	inboxView: (c) => c.reads.inboxView(KEPT(c)),
	backlogView: (c) => c.reads.backlogView(KEPT(c)),
	doneView: (c) => c.reads.doneView(KEPT(c)),
	search: (c, [query, project]) => c.ask(c.reads.searchRead(query as string, (project ?? undefined) as string | undefined)),
	screenOf: (c, [item]) => c.reads.screenOf(KEPT(c), item as A),
	reveal: (c, [item]) => {
		c.run(c.writes.revealUnfold(item as A));
		c.keepGrouping(revealedGrouping(c.grouping, item as A));
		return c.reads.screenOf(KEPT(c), item as A);
	},
	findIn: (c, [items, key]) => c.reads.findIn(items as A, key as A),
	listSections: (c) => c.reads.listSections(KEPT(c)),
	sectionOffer: (c, [date]) => c.reads.sectionOffer(KEPT(c), date as string),
	createInList: (c, [date, text]) => c.run(c.writes.createInList(date as string, text as string)),
	createInSoon: (c, [text]) => c.run(c.writes.createInSoon(text as string)),
	createAtTime: (c, [date, start, text]) => c.run(c.writes.createAtTime(date as string, start as number, text as string)),
	createInPlace: (c, [text, priority, place, repeat, labels]) => c.run(c.writes.createInPlace(text as string, (priority ?? null) as A, place as A, (repeat ?? null) as A, (labels ?? []) as A)),
	createWithId: (c, [text, priority, place, repeat, labels]) => c.run(c.writes.createWithId(text as string, (priority ?? null) as A, place as A, (repeat ?? null) as A, (labels ?? []) as A)),
	create: (c, [draft, slot]) => c.run(c.writes.create(draft as A, (slot ?? undefined) as A)),
	createSubtask: (c, [parent, draft]) => c.run(c.writes.createSubtask(parent as A, draft as A)),
	edit: (c, [key, draft]) => c.run(c.writes.edit(key as A, draft as A)),
	placementOf: (c, [item]) => c.reads.placementOf(item as A),
	dayColumn: (c, [date]) => c.reads.dayColumn(date as string),
	columnSections: (c, [column, date]) => c.reads.columnSections(column as A, date as string),
	placementOfDay: (c, [date]) => c.reads.placementOfDay(date as string),
	listName: (c, [list]) => c.reads.listName(list as A),
	placementTitle: (c, [placement]) => c.reads.placementTitle(placement as A),
	dayOfPlacement: (c, [placement]) => c.reads.dayOfPlacement(placement as A),
	setStatus: (c, [key, status]) => c.run(c.writes.setStatus(key as A, status as A)),
	toggleDone: (c, [key]) => c.run(c.writes.toggleDone(key as A)),
	setDueDate: (c, [key, date]) => c.run(c.writes.setDueDate(key as A, (date ?? null) as A)),
	setPriority: (c, [key, priority]) => c.run(c.writes.setPriority(key as A, (priority ?? null) as A)),
	setLabels: (c, [key, labels]) => c.run(c.writes.setLabels(key as A, labels as A)),
	setLabelsAll: (c, [steps]) => c.run(c.writes.setLabelsAll(steps as A)),
	setProject: (c, [keys, project]) => c.run(c.writes.setProject(keys as A, (project ?? null) as string | null)),
	projectNotes: (c) => c.reads.projectNotes(),
	setGrouping: (c, [list, on]) => c.keepGrouping(withGrouping(c.grouping, list as A, on as boolean)),
	toggleFold: (c, [list, key]) => c.keepGrouping(withFoldToggled(c.grouping, list as A, key as string)),
	setReminder: (c, [key, reminder]) => c.run(c.writes.setReminder(key as A, reminder as A)),
	togglePriority: (c, [keys, prefix]) => c.run(c.ask(c.writes.togglePriority(keys as A, prefix as string))),
	toggleLabel: (c, [keys, name]) => c.run(c.ask(c.writes.toggleLabel(keys as A, name as string))),
	removeDue: (c, [keys]) => c.run(c.writes.removeDue(KEPT(c), keys as A)),
	menu: (c, [item, from, screen]) => c.reads.menu(item as A, from as A, screen as A),
	bulkMenu: (c, [picked, screen]) => c.reads.bulkMenu(picked as A, screen as A),
	pickStatus: (c, [keys, id]) => c.run(c.writes.pickStatus(keys as A, id as A)),
	postponeAll: (c, [keys, date]) => c.run(c.writes.postponeAll(KEPT(c), keys as A, date as string)),
	removeAll: (c, [keys]) => c.run(c.writes.removeAll(keys as A)),
	carried: (c, [lifted, picked]) => c.reads.carried(lifted as A, picked as A),
	setCollapsed: (c, [key, collapsed]) => c.run(c.writes.setCollapsed(key as A, collapsed as boolean)),
	toggleCollapsed: (c, [key]) => c.run(c.writes.toggleCollapsed(key as A)),
	unfoldAbove: (c, [key]) => c.run(c.writes.unfoldAbove(key as A)),
	setRepeat: (c, [key, rule]) => c.run(c.writes.setRepeat(key as A, (rule ?? null) as A)),
	stop: (c, [key]) => c.run(c.writes.stop(key as A)),
	rename: (c, [key, text]) => c.run(c.writes.rename(KEPT(c), key as A, text as string)),
	fullTree: (c, [item]) => c.reads.fullTree(item as A),
	setDescription: (c, [key, markdown]) => c.run(c.writes.setDescription(key as A, markdown as string)),
	remove: (c, [key]) => c.run(c.writes.remove(key as A)),
	lineOf: (c, [key]) => c.ask(c.reads.lineOfRead(key as A)),
	find: (c, [key, text]) => c.reads.find(KEPT(c), key as A, text as string),
	moveBefore: (c, [key, before, date]) => c.run(c.writes.moveBefore(key as A, (before ?? null) as A, date as string)),
	nest: (c, [key, parent, before]) => c.run(c.writes.nest(key as A, parent as A, (before ?? null) as A)),
	setSlot: (c, [key, slot]) => c.run(c.writes.setSlot(key as A, slot as A)),
	shownSpan: (c, [item, day]) => c.reads.shownSpan(item as A, day as string),
	dropSpan: (c, [item, from, start]) => c.reads.dropSpan((item ?? null) as A, from as A, start as number),
	newSlot: (c, [day, start]) => c.reads.newSlot(day as string, start as number),
	snap: (_c, [minute, hourPx, tolerancePx]) => snapMinute(minute as number, hourPx as number, tolerancePx as number),
	stretch: (c, [item, day, edge, minute]) => c.reads.stretch(item as A, day as string, edge as A, minute as number),
	resize: (c, [key, day, edge, minute, min]) => c.run(c.writes.resize(KEPT(c), key as A, day as string, edge as A, minute as number, min as number)),
	clearSlot: (c, [key, place]) => c.run(c.writes.clearSlot(key as A, (place ?? undefined) as A)),
	moveToList: (c, [key, date]) => c.run(c.writes.moveToList(key as A, date as string)),
	moveToSoon: (c, [key, date]) => c.run(c.writes.moveToSoon(key as A, date as string)),
	postpone: (c, [key, date]) => c.run(c.writes.postpone(key as A, date as string)),
	moveToEnd: (c, [key, section]) => c.run(c.writes.moveToEnd(key as A, section as A)),
	moveToGroup: (c, [key, list, group, before, date]) => c.run(c.writes.moveToGroup(key as A, list as A, (group ?? null) as A, (before ?? null) as A, (date ?? undefined) as A)),
	createGroup: (c, [key, list, name, date]) => c.run(c.writes.createGroup(key as A, list as A, name as string, (date ?? undefined) as A)),
	toSection: (c, [keys, name]) => c.run(c.writes.toSection(KEPT(c), keys as A, (name ?? null) as A)),
	moveGroup: (c, [list, group, place]) => c.run(c.writes.moveGroup(list as A, (group ?? null) as A, place as A)),
	renameGroup: (c, args) => c.run(c.ask(c.writes.renameGroup(args[0] as A, args[1] as string, args[2] as string, scopeOf(args, 3)))),
	removeGroup: (c, args) => c.run(c.writes.removeGroup(args[0] as A, args[1] as string, scopeOf(args, 2))),
	createSection: (c, [name, place]) => c.run(c.writes.createSection(name as string, place as A)),
	applyAll: (c, [steps]) => c.run(c.writes.applyAll(steps as A)),
	drop: (c, [tasks, to, day]) => c.run(c.ask(c.writes.drop(tasks as A, to as A, day as string))),
	landing: (c, [tasks, to, day, project]) => c.ask(c.writes.landing(tasks as A, to as A, day as string, (project ?? undefined) as string | undefined)),
	normalize: (c) => c.normalize(),
	createFile: (c) => {
		if (c.hasTasks()) throw new DoorError("failed", "the tasks file is there already");
		c.effects.tasks = c.rules.emptyFile();
	},
};

/** The TaskService methods the door leaves to the host: it is the host that watches its files. */
export const HOST_TASK_METHODS: readonly string[] = ["onChange"];

function boundaryOf(c: Call): DayBoundary {
	return c.rules.moment().boundary;
}

const DAYS: Readonly<Record<string, Handler>> = {
	today: (c) => c.rules.today(),
	relation: (c, [date]) => dayRelation(date as string, c.rules.today()),
	step: (_c, [date, days]) => addDays(date as string, days as number),
	stepScreen: (c, [from, shift]) => stepScreen(from as ScreenAt, shift as -1 | 1, c.rules.today()),
	openAt: (c, [date]) => dayOpening(date as string, boundaryOf(c), c.rules.today(), c.now, c.settings.scrollToHour),
	/** Where a day begins: the hour it starts at. The `boundary.*` calls place by it. */
	boundary: (c) => ({ startHour: boundaryOf(c).startHour }),
};

/** The DayService methods the door leaves to the host: it watches the clock, and re-calls when today changes. */
export const HOST_DAY_METHODS: readonly string[] = ["onDayChange", "catchUp"];

/** DayBoundary's rules under the call's settings: times in epoch ms. */
const BOUNDARY: Readonly<Record<string, Handler>> = {
	startHour: (c) => boundaryOf(c).startHour,
	dayOf: (c, [ms]) => boundaryOf(c).dayOf(new Date(ms as number)),
	dayOfSlot: (c, [slot]) => boundaryOf(c).dayOfSlot(slot as A),
	offsetOf: (c, [day, ms]) => boundaryOf(c).offsetOf(day as string, new Date(ms as number)),
	clipToDay: (c, [day, startMs, endMs]) => boundaryOf(c).clipToDay(day as string, new Date(startMs as number), new Date(endMs as number)),
	spanOf: (c, [slot, day]) => boundaryOf(c).spanOf(slot as A, day as string),
	slotAt: (c, [day, start, end]) => boundaryOf(c).slotAt(day as string, start as number, (end ?? null) as A),
	hourAt: (c, [index]) => boundaryOf(c).hourAt(index as number),
	offsetOfHour: (c, [hour]) => boundaryOf(c).offsetOfHour(hour as number),
	clamp: (c, [slot, step]) => boundaryOf(c).clamp(slot as A, step as number),
};

function wireEvent(e: CalendarEvent, calendar: CalendarDay): WireEvent {
	const { start, end, ...rest } = e;
	return { ...rest, startMs: start.getTime(), endMs: end.getTime(), past: calendar.isPast(e) };
}

function wireDay(day: DayEvents, calendar: CalendarDay): WireDayEvents {
	const wire = (events: readonly CalendarEvent[]) => events.map((e) => wireEvent(e, calendar));
	return {
		events: wire(day.events),
		allDay: wire(day.allDay),
		timed: wire(day.timed),
		statuses: day.statuses.map(({ updatedAt, ...rest }) => ({ ...rest, updatedAtMs: updatedAt === null ? null : updatedAt.getTime() })),
		stale: day.stale,
	};
}

/** The sources the plugin fetches itself when the host does not say. */
const FETCHED_BY_DEFAULT: readonly CalendarSource[] = ["google"];

/** The calendars' files as handed in: a missing file is `fileMissing`, a broken one `failed`. */
function readingOf(c: Call): CalendarReading {
	const files = new Map<CalendarSource, CalendarFile>();
	const problems = new Map<CalendarSource, SourceProblem>();
	for (const source of CALENDAR_SOURCES) {
		const text = c.context.calendars?.[source] ?? null;
		if (text === null) {
			problems.set(source, { kind: "fileMissing" });
			continue;
		}
		try {
			files.set(source, readCalendarFile(text, source));
		} catch (e) {
			problems.set(source, { kind: "failed", detail: e instanceof Error ? e.message : String(e) });
		}
	}
	const fetched = c.context.fetched ?? FETCHED_BY_DEFAULT;
	return { sources: CALENDAR_SOURCES, files, problem: (s) => problems.get(s) ?? null, fed: (s) => fetched.includes(s) };
}

/** The calendars' rules over the files handed in. On the phone the old choice of calendars is carried over once, as the plugin does there. */
function calendarDay(c: Call): CalendarDay {
	const reading = readingOf(c);
	const day = new CalendarDay(reading, c.settings, c.now);
	const carried = day.carryOver(true);
	if (!carried) return day;
	c.saveSettings(carried);
	return new CalendarDay(reading, c.settings, c.now);
}

const CALENDARS: Readonly<Record<string, Handler>> = {
	events: (c, [date]) => {
		const day = calendarDay(c);
		return wireDay(day.events(date as string), day);
	},
	isPast: (c, [event]) => new CalendarDay(readingOf(c), c.settings, c.now).isPast({ end: new Date((event as { endMs: number }).endMs) }),
	known: (c) => calendarDay(c).known(),
	setShown: (c, [account, title, shown]) => {
		c.saveSettings(calendarDay(c).shownChange(account as string, title as string, shown as boolean));
	},
	files: (c) => calendarFiles(c),
	sources: (c) => CALENDAR_SOURCES.map((source) => ({ source, path: calendarPath(source, c.settings) })),
	meetings: (c, [fromMs, toMs]) => meetings(c, fromMs as number, toMs as number),
};

/** The calendars' files in the vault, by path from the vault folder, in the order the calendar reads them. */
function calendarFiles(c: Call): string[] {
	return CALENDAR_SOURCES.map((source) => calendarPath(source, c.settings));
}

/** The timed meetings of the calendars shown that overlap `from`–`to`; a file missing or unreadable adds none. */
function meetings(c: Call, fromMs: number, toMs: number): WireMeeting[] {
	return calendarDay(c)
		.timedBetween(new Date(fromMs), new Date(toMs))
		.map((e) => ({ title: e.title, startMs: e.start.getTime(), endMs: e.end.getTime() }));
}

/** The door's own calendar calls for the phone, beside CalendarService's. */
const PHONE_CALENDAR_METHODS: readonly string[] = ["files", "sources", "meetings"];

/** The CalendarService methods the door leaves to the host: it fetches, polls and watches the files, and calls `events` again. */
export const HOST_CALENDAR_METHODS: readonly string[] = ["onChange", "keepFresh"];

/**
 * The settings screen's reads and writes, SettingsServiceImpl's own over the `data.json` handed in: a write answers the
 * new `data.json` in `settings`; one the service refuses (a bad count, a tag of two words) answers none.
 */
const SETTINGS_METHODS: readonly string[] = [
	"form",
	"setTasksFile",
	"setSection",
	"setMarker",
	"setCount",
	"setDayStartHour",
	"renameLevel",
	"recolourLevel",
	"removeLevel",
	"addLevel",
	"moveLevel",
	"setLabelTag",
	"setLabelPaint",
	"setCardHeight",
	"setCardGap",
	"setZoomLevels",
	"setProjectTag",
	"renameLabel",
	"recolourLabel",
	"removeLabel",
	"addLabel",
	"moveLabel",
	"colourOf",
	"typedColour",
	"renamePreset",
	"removePreset",
	"addPreset",
	"movePreset",
	"setUngrouped",
	"setGoogleClientId",
	"setWorkCalendarFile",
];

const SETTINGS: Readonly<Record<string, Handler>> = Object.fromEntries(
	SETTINGS_METHODS.map((name) => [
		name,
		(c: Call, args: unknown[]) => {
			const answer = (new SettingsServiceImpl(c.store) as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
			return answer instanceof Promise ? null : answer;
		},
	]),
);

/** The SettingsService methods the door leaves to the host: the client secret's field binds an Obsidian text field to the saved secret. */
export const HOST_SETTINGS_METHODS: readonly string[] = ["bindClientSecret"];

/** What a screen reads of the shared settings, as ScreenSettingsStore gives it. */
const SCREEN_SETTINGS: Readonly<Record<string, Handler>> = {
	get: (c) => screenSettingsOf(c.settings),
};

/** The reminder's time as the app shows it: `10:00`, or `10:00–11:00`. */
function reminderTime(start: number, end: number | null): string {
	return end === null ? minutesToHHMM(start) : `${minutesToHHMM(start)}–${minutesToHHMM(end % MINUTES_PER_DAY)}`;
}

/** An action on the reminding task whose line is `id`: the file written, or staleTask when no such task is left. */
function onReminder(c: Call, id: string, action: (key: TaskKey) => Operation): void {
	if (!c.write((text) => new TaskReminders(c.rules, c.clock).act(text, id, action))) throw new DoorError("staleTask", `no reminding task ${id}`);
}

/** The phone's reminders: which tasks ring and when, and the actions on a reminder shown. */
const REMINDERS: Readonly<Record<string, Handler>> = {
	list: (c) =>
		new TaskReminders(c.rules, c.clock).ringing(c.tasks()).map(
			({ key, startMinute, endMinute, start, dayEnd, title, kind, date }): WireReminder => ({
				id: key.raw,
				title,
				body: reminderTime(startMinute, endMinute),
				kind,
				date,
				startMs: start.getTime(),
				dayEndMs: dayEnd.getTime(),
			}),
		),
	complete: (c, [id]) => onReminder(c, id as string, (key) => c.rules.setStatus(key, "done")),
	/** The task stays on its time; it no longer reminds. */
	silence: (c, [id]) => onReminder(c, id as string, (key) => c.rules.setReminder(key, "none")),
	snooze: (c, [id, minutes]) => onReminder(c, id as string, (key) => c.rules.snooze(key, minutes as number)),
};

/** The lists the phone's new task screen offers, in its order: Inbox first, where a task told to Siri goes. */
const CAPTURE_LISTS: readonly GroupedList[] = ["inbox", "now", "soon", "backlog"];

/**
 * A task typed or spoken on the phone, last in `list` as the plugin's quick entry puts it: the words typed, then the
 * recording's link and its tag (`captureTitle`). Nothing of either is `blank`; a title of only a priority is written,
 * unlike the plugin's `createInPlace`: the phone's capture writes what it was told.
 */
const CAPTURE: Readonly<Record<string, Handler>> = {
	add: (c, [list, typed, recording, tag]) => {
		const title = captureTitle({ typed: typed as string, recording: (recording ?? null) as string | null, tag: (tag ?? "") as string });
		if (title === "") throw new DoorError("blank", "the task has no title");
		c.write((text) => c.rules.change(text, c.rules.placeNew(title, null, { kind: "list", list: list as GroupedList, group: null, before: null })).text);
	},
	lists: (c) => CAPTURE_LISTS.map((list) => ({ list, name: c.settings.sections[list] })),
};

const HISTORY: Readonly<Record<string, Handler>> = {
	undo: (c) => c.undo("undo"),
	redo: (c) => c.undo("redo"),
	canUndo: (c) => new UndoSteps(c.context.history).canUndo(),
	canRedo: (c) => new UndoSteps(c.context.history).canRedo(),
};

/** The pure rules the plugin's UI calls itself, by their names in contracts.ts. */
const RULES: Readonly<Record<string, (...args: A[]) => unknown>> = {
	nextProgress,
	sameSlot,
	sameRule: (a, b) => sameRule(a ?? null, b ?? null),
	repeatParts,
	editRepeat,
	repeatDraft: (day, rule) => repeatDraft(day, rule ?? null),
	samePlacement,
	keyId,
	sameLine,
	samePlace,
	sameTaskTree,
	fitLevel,
	gapOfPlace,
	levelRange,
	placeOfGap,
	shiftLevel,
	gapAt,
	groupPlaceOf,
	placeOfDrop: (cards, place, home) => placeOfDrop(cards, place, home ?? null),
	sameGap,
	listView: (items, sections, listSections) => listView(items, sections, listSections ?? []),
	sectionChoice,
	cardDue: (item, day) => cardDue(item, day ?? null),
	textParts,
	oneLine,
	sameLevels,
	labelTitle,
	sameLabels,
	isPresetColor,
	usableColor,
	acceptsDrop,
	placesInGap,
	noteTags,
	projectNotes: (notes, tag) => projectNotesOfTexts(notes, tag),
	shadesOf,
	inkOf,
	contrast,
	eventHex,
	bgAlphaFor,
	eventColors: (hex, bgAlpha, theme) => eventColors(hex, bgAlpha ?? EVENT_BG_ALPHA, theme ?? "dark"),
	dayTitle,
	dueLabel,
	dayMonth,
	eventLevels,
	stackTasks,
	overlayLeft,
	eventLeft,
	stackCorner,
	timeParts,
	durationParts,
	pastEventPaint,
	parseZoomLevels,
	formatZoomLevels,
	levelsFor,
	gridAt,
	gridMarks,
	zoomAfterPinch: (hourPx, wholeDayPx, levels) => zoomAfterPinch(hourPx, wholeDayPx ?? null, levels),
	zoomShown: (saved, wholeDayPx, levels) => zoomShown(saved, wholeDayPx ?? null, levels),
	labelHidesNearNow: (y, nowY, lift, pillHeight) => labelHidesNearNow(y, nowY ?? null, lift, pillHeight),
	levelAt,
	carriedMiddle,
	placeAt: (cards, y, level, shift, room, heads, held, hysteresis) => placeAt(cards, y, level, shift, room ?? null, heads ?? [], held ?? null, hysteresis ?? 0),
	branchOf,
	gapBranch,
	placeShowing,
	wholeWidth,
	grownStart,
	listWidths,
	listShareOf,
	dividerAt,
	repeatValue,
	onTheDay,
	canPick,
};

/** contracts.ts's runtime constants, as the UI reads them. */
const CONSTANTS = { REMINDER_KINDS, MINUTES_PER_DAY, DESCRIPTION_TEMPLATE, PRIORITY_COLORS, EVENT_BG_ALPHA, LISTS: GROUPED_LISTS, DEFAULT_ZOOM_LEVELS, DEFAULT_ZOOM_HOUR, SCREEN_PLACES, SHOWN_LISTS, CARD_HEIGHTS, CARD_GAPS, DEFAULT_CARD_SIZE, LIST_WIDTHS, REPEAT_WORDS, DIVIDER_SNAP, MOST_CARD_COLORS };

/** What the timeline reads of `data.json` beside the shared settings: the zoom's levels, so a host never parses the file. */
const TIMELINE: Readonly<Record<string, Handler>> = {
	zoomLevels: (c) => zoomLevelsOf(c.context.settings?.trim() ? JSON.parse(c.context.settings) : null),
};

/** A quick entry's look from the wire. */
function lookOf(c: Call, look: WireLook): EntryLook {
	return {
		cards: (column) => look.cards[column] ?? [],
		sections: (column) => look.sections?.[column] ?? [],
		sectioned: (column) => look.sectioned?.[column] ?? false,
		day: () => look.day,
		today: () => c.rules.today(),
		shown: () => look.shown,
		project: () => look.project ?? undefined,
	};
}

/** What a quick-entry call answers: the session to hand in next, the field's state, each change on the way, the jobs it queued, and the method's own value. */
export interface EntryAnswer {
	readonly session: EntrySession;
	readonly state: EntryState | null;
	readonly changes: readonly { readonly state: EntryState | null; readonly drawnNext: boolean }[];
	readonly jobs: readonly EntryJob[];
	readonly value: unknown;
	/** The renames entered and not yet written: each card shows its new text meanwhile (`QuickEntry.renamed`). */
	readonly renamed: readonly PendingRename[];
}

/** The QuickEntry methods a host calls, each `[session, look, ...args]`; the rest are the jobs' life (`call`, `shown`, `unshown`, `done`). */
const ENTRY_METHODS: readonly string[] = [
	"listEntry",
	"openAtEnd",
	"openFromPlus",
	"openIn",
	"openSlot",
	"openAtDrop",
	"subtaskSpot",
	"renameSpot",
	"stackSpot",
	"stackEntry",
	"open",
	"type",
	"setPriority",
	"togglePriority",
	"setLabels",
	"toggleLabel",
	"setRepeat",
	"indent",
	"toggleSection",
	"enter",
	"blur",
	"escape",
	"choosePlace",
	"moveToEnd",
	"placeOf",
	"call",
	"unshown",
	"done",
	"job",
];

function entryCall(name: string): Handler {
	return (c, [session, look, ...args]) => {
		const changes: { state: EntryState | null; drawnNext: boolean }[] = [];
		const jobs: EntryJob[] = [];
		const kept = (session ?? emptySession()) as EntrySession;
		const entry = new QuickEntry(c.reads, lookOf(c, look as WireLook), kept, (state, drawnNext) => changes.push({ state, drawnNext: drawnNext === true }), (job) => jobs.push(job));
		let value: unknown;
		if (name === "state") value = entry.state;
		else if (name === "renaming") value = entry.renaming;
		else if (name === "shown") {
			const [id, created, coming] = args as [string, A, Partial<Record<DropColumn, readonly ListCard[]>>];
			entry.shown(id, created ?? null, (column) => coming?.[column] ?? []);
		} else value = (entry as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
		return { session: entry.session, state: entry.state, changes, jobs, value: value === undefined ? null : value, renamed: entry.renamed } satisfies EntryAnswer;
	};
}

const ENTRY: Readonly<Record<string, Handler>> = Object.fromEntries([...ENTRY_METHODS, "state", "renaming", "shown"].map((name) => [name, entryCall(name)]));

const SECTION_NAME: Readonly<Record<string, Handler>> = {
	end: (_c, [ended, event, text]) => sectionNameEnd(ended === true, event as A, (text ?? "") as string),
};

/** A task menu's repeat page closed: what it writes (`RepeatPage`). */
const REPEAT_PAGE: Readonly<Record<string, Handler>> = {
	end: (_c, [own, held]) => repeatPageEnd((own ?? null) as A, (held ?? null) as A),
};

/** The full screen's description editor (`DescriptionDraft`): the host keeps `state` between calls and hands it in. */
const DESCRIPTION: Readonly<Record<string, Handler>> = {
	open: (_c, [description]) => descriptionOpen((description ?? null) as string | null),
	typed: (_c, [state]) => descriptionTyped(state as A),
	save: (_c, [state]) => descriptionSave(state as A),
	read: (_c, [state, description, editor]) => descriptionRead(state as A, (description ?? null) as string | null, editor as A),
};

/**
 * The vault's notes for a host without Obsidian: the `[[` typed in a title and the notes it offers, and the note a link
 * in a title opens. Its project notes come from `rules.noteTags` and `rules.projectNotes`.
 */
const NOTES: Readonly<Record<string, Handler>> = {
	linkQuery: (_c, [text, caret]) => linkQuery(text as string, caret as number),
	suggest: (_c, [query, notes, limit]) => noteSuggestions(query as string, notes as VaultNote[], (limit ?? undefined) as number | undefined),
	insert: (_c, [text, at, link]) => withNoteLink(text as string, at as LinkQuery, link as string),
	open: (_c, [target, notes]) => noteOfLink(target as string, notes as VaultNote[]),
};

const SPACES: Readonly<Record<string, Readonly<Record<string, Handler>>>> = {
	tasks: TASKS,
	days: DAYS,
	boundary: BOUNDARY,
	calendars: CALENDARS,
	history: HISTORY,
	settings: SETTINGS,
	screenSettings: SCREEN_SETTINGS,
	entry: ENTRY,
	sectionName: SECTION_NAME,
	repeatPage: REPEAT_PAGE,
	description: DESCRIPTION,
	reminders: REMINDERS,
	capture: CAPTURE,
	timeline: TIMELINE,
	notes: NOTES,
	rules: { ...Object.fromEntries(Object.entries(RULES).map(([name, fn]) => [name, (_c: Call, args: unknown[]) => fn(...args)])), constants: () => CONSTANTS },
};

/**
 * An interface of contracts.ts the door answers in `space`, but for the methods the host keeps, with the door's own calls
 * in that space beside it (`own`); or one the host owns whole, and why.
 */
export type DoorCoverage = { readonly space: string; readonly host: readonly string[]; readonly own?: readonly string[] } | { readonly hostOwned: string };

/** Every interface of contracts.ts with a method: where the door answers it, or why a host keeps it. */
export const DOOR_COVERAGE: Readonly<Record<string, DoorCoverage>> = {
	TaskService: { space: "tasks", host: HOST_TASK_METHODS },
	DayService: { space: "days", host: HOST_DAY_METHODS },
	UndoService: { space: "history", host: ["onChange"] },
	CalendarService: { space: "calendars", host: HOST_CALENDAR_METHODS, own: PHONE_CALENDAR_METHODS },
	SettingsService: { space: "settings", host: HOST_SETTINGS_METHODS },
	ScreenSettingsStore: { space: "screenSettings", host: ["onChange"] },
	GoogleAccount: { hostOwned: "Google's login is a browser's consent and a token fetched over the network, and whether one is kept goes with it: the door makes no request" },
	WorkCalendarSetup: { hostOwned: "the Scriptable script and the Shortcuts export are the Obsidian plugin's fallback on the iPhone; an app writes calendar/iphone.json itself (iphoneCalendarText)" },
	DayEventsAsk: { hostOwned: "`calendars.events` answers the day over the files handed in; fetching them afresh is the host's" },
	PolledScreen: { hostOwned: "the frontend implements it for keepFresh, which is the host's" },
	CalendarPoll: { hostOwned: "keepFresh answers it, and polling is the host's" },
	SecretField: { hostOwned: "the frontend implements it for bindClientSecret, which is the host's" },
};

/** Every method the door answers, `space.name`, in order. */
export function doorMethods(): string[] {
	return Object.entries(SPACES).flatMap(([space, handlers]) => Object.keys(handlers).map((name) => `${space}.${name}`));
}

/** The method's answer over the context, every value as it crosses the door. */
export function callDoor(method: string, args: readonly unknown[], context: DoorContext): DoorAnswer {
	try {
		const [space, name] = method.split(".");
		const handler = SPACES[space]?.[name];
		if (!handler || !Object.prototype.hasOwnProperty.call(SPACES, space) || !Object.prototype.hasOwnProperty.call(SPACES[space], name)) throw new DoorError("unknownMethod", `no method ${method}`);
		if (!Array.isArray(args)) throw new DoorError("badArguments", "the arguments are a list");
		const call = new Call(context);
		const result = handler(call, [...args]);
		return { ok: true, result: result === undefined ? null : result, ...call.effects };
	} catch (e) {
		return { ok: false, error: errorOf(e) };
	}
}

function errorOf(e: unknown): { readonly code: DoorErrorCode; readonly message: string } {
	const message = e instanceof Error ? e.message : String(e);
	if (e instanceof DoorError) return { code: e.code, message };
	if (e instanceof StaleTaskError) return { code: e.code, message };
	if (e instanceof TasksFileMissingError) return { code: e.code, message };
	if (e instanceof SyntaxError) return { code: "badArguments", message };
	return { code: "failed", message };
}

/**
 * A value as JSON text. Strict, it refuses what JSON would change on the way: a Date (a string), a field set to undefined
 * (dropped), a function, a class's instance, a Map, a number JSON cannot hold. The tests call the door strict.
 */
export function plainJson(value: unknown, strict = false): string {
	if (strict) checkPlain(value, "answer");
	return JSON.stringify(value);
}

function checkPlain(value: unknown, path: string): void {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${path} is ${value}: no JSON number`);
		return;
	}
	if (Array.isArray(value)) return value.forEach((v, i) => checkPlain(v, `${path}[${i}]`));
	if (typeof value !== "object") throw new Error(`${path} is ${typeof value}: no JSON value`);
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) throw new Error(`${path} is a ${(value as object).constructor?.name ?? "class"}: no plain object`);
	for (const [key, v] of Object.entries(value)) {
		if (v === undefined) throw new Error(`${path}.${key} is undefined: JSON drops it`);
		checkPlain(v, `${path}.${key}`);
	}
}

/** `callDoor` over text: the arguments and the context as JSON, the answer as JSON; strict, an answer that is no plain JSON throws. */
export function callDoorJson(method: string, argsJson: string, contextJson: string, strict = false): string {
	let args: unknown;
	let context: DoorContext;
	try {
		args = argsJson.trim() === "" ? [] : JSON.parse(argsJson);
		context = JSON.parse(contextJson) as DoorContext;
	} catch (e) {
		return JSON.stringify({ ok: false, error: { code: "badArguments", message: e instanceof Error ? e.message : String(e) } });
	}
	return plainJson(callDoor(method, args as unknown[], context), strict);
}

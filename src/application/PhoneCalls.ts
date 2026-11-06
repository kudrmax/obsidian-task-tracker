import type { DayBoundary } from "../domain/DayBoundary";
import { GROUPED_LISTS } from "../domain/Lists";
import { dayRelation } from "../domain/Days";
import { addDays, MINUTES_PER_DAY } from "../domain/LocalDate";
import { DESCRIPTION_TEMPLATE } from "../domain/description";
import { isPresetColor, PRIORITY_COLORS } from "../domain/Priority";
import { labelTitle, sameLabels } from "../domain/Label";
import { sameRule, repeatParts } from "../domain/Repeat";
import { editRepeat, repeatDraft } from "../domain/RepeatDraft";
import { nextProgress, REMINDER_KINDS, sameSlot } from "../domain/Task";
import { textParts } from "../domain/TaskText";
import { oneLine } from "../domain/TaskTitle";
import { samePlacement } from "../domain/operations";
import { sameLevels, settingsFrom, type TaskCalendarSettings } from "../settings";
import { CalendarDay, type CalendarReading } from "./calendarDay";
import { CALENDAR_SOURCES, type CalendarFile, readCalendarFile } from "./calendarFile";
import { cardDue } from "./cardDue";
import { type CalendarEvent, type CalendarSource, type DayEvents, type DropColumn, type GroupName, StaleTaskError, type SourceProblem, type SourceStatus, TasksFileMissingError } from "./contracts";
import { acceptsDrop, placesInGap } from "./drops";
import { fitLevel, gapAt, gapOfPlace, groupPlaceOf, levelRange, type ListCard, placeOfDrop, placeOfGap, sameGap, shiftLevel } from "./nesting";
import type { Clock, SettingsStore } from "./ports";
import { emptySession, type EntryJob, type EntryLook, type EntrySession, type EntryState, QuickEntry } from "./QuickEntry";
import { sectionNameEnd } from "./SectionNameEntry";
import { screenSettingsOf } from "./ScreenSettingsImpl";
import { SettingsServiceImpl } from "./SettingsServiceImpl";
import { listView, sectionChoice } from "./sections";
import { keyId, sameLine, samePlace, sameTaskTree } from "./taskKeys";
import { type Snapshot, TaskReads } from "./TaskReads";
import { TaskRules } from "./TaskRules";
import { TaskWrites, type Write } from "./TaskWrites";
import { type UndoState, UndoSteps } from "./UndoSteps";
import { snapMinute } from "./snapGrid";
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
	  }
	| { readonly ok: false; readonly error: { readonly code: DoorErrorCode; readonly message: string } };

/** `staleTask`: a task or section the call names is no longer there as read. `tasksFileMissing`: the call needs the tasks file. */
export type DoorErrorCode = "staleTask" | "tasksFileMissing" | "unknownMethod" | "badArguments" | "failed";

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
	readonly sections?: Partial<Record<DropColumn, readonly GroupName[]>>;
	readonly sectioned?: Partial<Record<DropColumn, boolean>>;
	/** The day the day's list shows. */
	readonly day: string;
	/** The lists the screen shows, in its order. */
	readonly shown: readonly DropColumn[];
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
	readonly effects: Effects = {};
	private text: string | null;
	/** `data.json` as handed in: what a change of the settings is written over. */
	private readonly settingsText: string;

	constructor(readonly context: DoorContext) {
		this.settingsText = context.settings ?? "";
		this.current = settingsOf(this.settingsText);
		const clock: Clock = { now: () => new Date(context.nowMs) };
		const store: SettingsStore = {
			get: () => this.current,
			update: async (patch) => this.saveSettings(patch),
			onChange: () => () => undefined,
		};
		this.store = store;
		this.rules = new TaskRules(store, clock);
		this.reads = new TaskReads(this.rules, store, clock);
		this.writes = new TaskWrites(this.rules, this.reads);
		this.text = context.tasks ?? null;
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
		return { doc: this.rules.read(this.tasks(), at).doc, today: at.today, boundary: at.boundary };
	}

	/** The file tidied for today, as the plugin's service writes it before a screen: no step. */
	normalize(): void {
		if (this.text === null || !this.rules.read(this.text).changed) return;
		this.setText(this.rules.change(this.text, (d) => d).text, false);
	}

	/** A write as one action: its operation over the text, the new text a step of the history. */
	run<R>(write: Write<R>): R {
		if (!write.operation) return write.answer(null);
		const before = this.tasks();
		const change = this.rules.change(before, write.operation);
		this.setText(change.text, true);
		return write.answer({ before: change.before, after: change.after });
	}

	/** The tasks text a step back or forward leaves. */
	undo(way: "undo" | "redo"): string {
		const steps = new UndoSteps(this.context.history);
		const { outcome, text } = steps.step(way, this.tasks());
		this.effects.history = steps.state;
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

	private setText(text: string, step: boolean): void {
		const before = this.text;
		if (text === before) return;
		this.text = text;
		this.effects.tasks = text;
		if (!step) return;
		const steps = new UndoSteps(this.effects.history ?? this.context.history);
		if (before !== null && steps.record(before, text)) {
			this.effects.step = true;
			this.effects.history = steps.state;
		}
	}
}

type Handler = (call: Call, args: unknown[]) => unknown;
type A = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const KEPT = (call: Call): Snapshot => call.snapshot();

/** Every TaskService method a frontend calls, by name, over the call's text. */
const TASKS: Readonly<Record<string, Handler>> = {
	priorityLevels: (c) => c.reads.priorityLevels(),
	labelLevels: (c) => c.reads.labelLevels(),
	parseTitle: (c, [text]) => c.reads.parseTitle(text as string),
	isBlank: (c, [text]) => c.reads.isBlank(text as string),
	withPriority: (c, [text, prefix]) => c.reads.withPriority(text as string, (prefix ?? null) as string | null),
	draftMarks: (c, [text, priority, labels]) => c.reads.draftMarks(text as string, (priority ?? null) as string | null, (labels ?? []) as string[]),
	screen: (c, [date]) => {
		if (!c.hasTasks()) return c.reads.missingScreen(date as string);
		c.normalize();
		return c.reads.screen(KEPT(c), date as string);
	},
	dayView: (c, [date]) => c.reads.dayView(KEPT(c), date as string),
	soonWithoutDateView: (c) => c.reads.soonWithoutDateView(KEPT(c)),
	inboxView: (c) => c.reads.inboxView(KEPT(c)),
	backlogView: (c) => c.reads.backlogView(KEPT(c)),
	doneView: (c) => c.reads.doneView(KEPT(c)),
	search: (c, [query]) => (c.reads.searches(query as string) ? c.reads.search(KEPT(c), query as string) : []),
	screenOf: (c, [item]) => c.reads.screenOf(KEPT(c), item as A),
	reveal: (c, [item]) => {
		c.run(c.writes.revealUnfold(item as A));
		return c.reads.screenOf(KEPT(c), item as A);
	},
	findIn: (c, [items, key]) => c.reads.findIn(items as A, key as A),
	listSections: (c) => c.reads.listSections(KEPT(c)),
	sectionOffer: (c, [date]) => c.reads.sectionOffer(KEPT(c), date as string),
	createInList: (c, [date, text]) => c.run(c.writes.createInList(date as string, text as string)),
	createInSoon: (c, [text]) => c.run(c.writes.createInSoon(text as string)),
	createAtTime: (c, [date, start, text]) => c.run(c.writes.createAtTime(date as string, start as number, text as string)),
	createInPlace: (c, [text, priority, place, repeat, labels]) => c.run(c.writes.createInPlace(text as string, (priority ?? null) as A, place as A, (repeat ?? null) as A, (labels ?? []) as A)),
	create: (c, [draft, slot]) => c.run(c.writes.create(draft as A, (slot ?? undefined) as A)),
	createSubtask: (c, [parent, draft]) => c.run(c.writes.createSubtask(parent as A, draft as A)),
	edit: (c, [key, draft]) => c.run(c.writes.edit(key as A, draft as A)),
	placementOf: (c, [item]) => c.reads.placementOf(item as A),
	dayColumn: (c, [date]) => c.reads.dayColumn(date as string),
	columnSections: (c, [column, date]) => c.reads.columnSections(column as A, date as string),
	placementOfDay: (c, [date]) => c.reads.placementOfDay(date as string),
	listName: (c, [list]) => c.reads.listName(list as A),
	dayOfPlacement: (c, [placement]) => c.reads.dayOfPlacement(placement as A),
	setStatus: (c, [key, status]) => c.run(c.writes.setStatus(key as A, status as A)),
	toggleDone: (c, [key]) => c.run(c.writes.toggleDone(key as A)),
	setDueDate: (c, [key, date]) => c.run(c.writes.setDueDate(key as A, (date ?? null) as A)),
	setPriority: (c, [key, priority]) => c.run(c.writes.setPriority(key as A, (priority ?? null) as A)),
	setLabels: (c, [key, labels]) => c.run(c.writes.setLabels(key as A, labels as A)),
	setLabelsAll: (c, [steps]) => c.run(c.writes.setLabelsAll(steps as A)),
	setReminder: (c, [key, reminder]) => c.run(c.writes.setReminder(key as A, reminder as A)),
	togglePriority: (c, [keys, prefix]) => ((keys as A[]).length === 0 ? undefined : c.run(c.writes.togglePriority(KEPT(c), keys as A, prefix as string))),
	toggleLabel: (c, [keys, name]) => ((keys as A[]).length === 0 ? [] : c.run(c.writes.toggleLabel(KEPT(c), keys as A, name as string))),
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
	lineOf: (c, [key]) => {
		c.normalize();
		return c.reads.lineOf(c.tasks(), key as A);
	},
	find: (c, [key, text]) => c.reads.find(KEPT(c), key as A, text as string),
	moveBefore: (c, [key, before, date]) => c.run(c.writes.moveBefore(key as A, (before ?? null) as A, date as string)),
	nest: (c, [key, parent, before]) => c.run(c.writes.nest(key as A, parent as A, (before ?? null) as A)),
	setSlot: (c, [key, slot]) => c.run(c.writes.setSlot(key as A, slot as A)),
	shownSpan: (c, [item, day]) => c.reads.shownSpan(item as A, day as string),
	dropSpan: (c, [item, from, start]) => c.reads.dropSpan((item ?? null) as A, from as A, start as number),
	newSlot: (c, [day, start]) => c.reads.newSlot(day as string, start as number),
	snap: (_c, [minute, hourPx]) => snapMinute(minute as number, hourPx as number),
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
	renameGroup: (c, [list, group, name]) => {
		const rename = c.writes.renameGroup(list as A, group as string, name as string);
		return rename.operation ? c.run(rename.plan(KEPT(c))) : false;
	},
	removeGroup: (c, [list, group]) => c.run(c.writes.removeGroup(list as A, group as string)),
	createSection: (c, [name, place]) => c.run(c.writes.createSection(name as string, place as A)),
	applyAll: (c, [steps]) => c.run(c.writes.applyAll(steps as A)),
	drop: (c, [tasks, to, day]) => {
		const drop = c.writes.drop(tasks as A, to as A, day as string);
		return c.run(drop.plan(drop.reads ? KEPT(c) : null));
	},
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
};

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
	acceptsDrop,
	placesInGap,
};

/** contracts.ts's runtime constants, as the UI reads them. */
const CONSTANTS = { REMINDER_KINDS, MINUTES_PER_DAY, DESCRIPTION_TEMPLATE, PRIORITY_COLORS, LISTS: GROUPED_LISTS };

/** A quick entry's look from the wire. */
function lookOf(c: Call, look: WireLook): EntryLook {
	return {
		cards: (column) => look.cards[column] ?? [],
		sections: (column) => look.sections?.[column] ?? [],
		sectioned: (column) => look.sectioned?.[column] ?? false,
		day: () => look.day,
		today: () => c.rules.today(),
		shown: () => look.shown,
	};
}

/** What a quick-entry call answers: the session to hand in next, the field's state, each change on the way, the jobs it queued, and the method's own value. */
export interface EntryAnswer {
	readonly session: EntrySession;
	readonly state: EntryState | null;
	readonly changes: readonly { readonly state: EntryState | null; readonly drawnNext: boolean }[];
	readonly jobs: readonly EntryJob[];
	readonly value: unknown;
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
		return { session: entry.session, state: entry.state, changes, jobs, value: value === undefined ? null : value } satisfies EntryAnswer;
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
	rules: { ...Object.fromEntries(Object.entries(RULES).map(([name, fn]) => [name, (_c: Call, args: unknown[]) => fn(...args)])), constants: () => CONSTANTS },
};

/** An interface of contracts.ts the door answers in `space`, but for the methods the host keeps; or one the host owns whole, and why. */
export type DoorCoverage = { readonly space: string; readonly host: readonly string[] } | { readonly hostOwned: string };

/** Every interface of contracts.ts with a method: where the door answers it, or why a host keeps it. */
export const DOOR_COVERAGE: Readonly<Record<string, DoorCoverage>> = {
	TaskService: { space: "tasks", host: HOST_TASK_METHODS },
	DayService: { space: "days", host: HOST_DAY_METHODS },
	UndoService: { space: "history", host: ["onChange"] },
	CalendarService: { space: "calendars", host: HOST_CALENDAR_METHODS },
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

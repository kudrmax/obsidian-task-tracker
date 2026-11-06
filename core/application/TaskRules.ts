import type { DayBoundary } from "../domain/DayBoundary";
import { dayColumn } from "../domain/Days";
import { isBlankTitle } from "../domain/Priority";
import { normalize } from "../domain/normalize";
import * as ops from "../domain/operations";
import { type Column, columnGroups, columnList } from "../domain/queries";
import type { LocalDate, ReminderKind, Slot, TaskStatus } from "../domain/Task";
import { TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { EntryTags } from "../domain/EntryTags";
import { taskTitle } from "../domain/TaskTitle";
import { type PriorityLevel, type TaskCalendarSettings, usableLevels } from "../settings";
import {
	StaleTaskError,
	type EndList,
	type GroupedList,
	type GroupName,
	type GroupPlace,
	type NewTaskPlace,
	type RepeatRule,
	type SectionPlace,
	type TaskChange,
	type TaskDraft,
	type TaskKey,
	type TaskStep,
} from "./contracts";
import { boundaryOf, parseText, readDocument, readingKey, sectionNames } from "./documentText";
import type { Clock, SettingsStore } from "./ports";
import { isUnder, sameLine, samePlace } from "./taskKeys";

/** An action's change of the document read at `today`; it throws `StaleTaskError` when a task or section it names is gone. */
export type Operation = (doc: TaskDocument, today: LocalDate, settings: TaskCalendarSettings, boundary: DayBoundary) => TaskDocument;

/** The settings and the day a reading or a change is made under: taken once, so the text and the day agree. */
export interface Moment {
	readonly settings: TaskCalendarSettings;
	readonly boundary: DayBoundary;
	readonly today: LocalDate;
	/** `readingKey` with the hour the day starts at: what a document read under it depends on besides the text and the day. */
	readonly reading: string;
}

/** The text read: normalized for the day, and whether normalizing changes what the file says. */
export interface Reading {
	readonly doc: TaskDocument;
	readonly changed: boolean;
}

/** The text an operation wrote, and the document as normalized before and after it. */
export interface TextChange {
	readonly text: string;
	readonly before: TaskDocument;
	readonly after: TaskDocument;
}

/** The changes that take a task elsewhere: its subtasks go along with it. */
const MOVES: ReadonlySet<TaskChange["kind"]> = new Set(["postpone", "moveBefore", "moveToList", "moveToSoon", "moveToEnd", "moveToGroup", "createGroup", "nest"]);

/** The other tasks a change names: the task to stand before, or the parent and the subtask to stand before. */
function refsOf(change: TaskChange): readonly (TaskKey | null)[] {
	if (change.kind === "moveBefore" || change.kind === "moveToGroup") return [change.before];
	if (change.kind === "nest") return [change.parent, change.before];
	return [];
}

/** The same task as read: its place and its line. */
function sameKey(a: TaskKey, b: TaskKey): boolean {
	return samePlace(a, b) && sameLine(a, b);
}

function columnOfPlace(place: SectionPlace, today: LocalDate): Column {
	if (place.kind === "day") return { kind: "day", date: place.date };
	if (place.list === "now") return { kind: "day", date: place.date ?? today };
	if (place.list === "soon" && place.date !== undefined && place.date > today) return { kind: "day", date: place.date };
	return { kind: place.list };
}

/** A section's name of nothing: unlike a title, a level's prefix alone names a section. */
function blankName(name: string): boolean {
	return name.trim() === "";
}

/**
 * The tasks file's rules over its text, synchronous: how it reads under the settings at the clock's moment, and what each
 * action writes. The plugin's TaskServiceImpl runs them over the vault's file; the phone's door over the text the iOS app
 * hands it. An action is an operation, or null when there is nothing to do (a blank title).
 */
export class TaskRules {
	constructor(
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
	) {}

	moment(): Moment {
		const settings = this.settings.get();
		const boundary = boundaryOf(settings);
		return { settings, boundary, today: boundary.dayOf(this.clock.now()), reading: JSON.stringify([readingKey(settings), settings.dayStartHour]) };
	}

	today(): LocalDate {
		return this.moment().today;
	}

	priorityLevels(): readonly PriorityLevel[] {
		return usableLevels(this.settings.get().priorities);
	}

	/** A title of nothing but a priority is blank too. */
	isBlank(text: string): boolean {
		return isBlankTitle(text, this.priorityLevels().map((l) => l.prefix));
	}

	read(text: string, at: Moment = this.moment()): Reading {
		const { settings, today, boundary } = at;
		const presets = ops.usablePresets(settings.groups.presets);
		const parsed = parseText(text, settings);
		const whole = parsed.ensureSections(sectionNames(settings));
		const doc = normalize(whole, today, boundary, presets);
		const changed = whole === parsed ? doc !== whole : normalize(parsed, today, boundary, presets) !== parsed;
		return { doc, changed };
	}

	/** The text after `operation` on the document read and normalized; the result is normalized again. */
	change(text: string, operation: Operation, at: Moment = this.moment()): TextChange {
		const { settings, today, boundary } = at;
		return this.written(readDocument(text, settings, today, boundary), operation, at);
	}

	/**
	 * The text after `operation` on the file as it is, before today's normalizing: for a task that normalizing would change,
	 * such as yesterday's slot, which the next day erases. The result is normalized as usual.
	 */
	changeAsRead(text: string, operation: Operation, at: Moment = this.moment()): TextChange {
		return this.written(this.asRead(text, at), operation, at);
	}

	/** The document as the file has it, with every section, not normalized. */
	asRead(text: string, at: Moment = this.moment()): TaskDocument {
		return parseText(text, at.settings).ensureSections(sectionNames(at.settings));
	}

	/** The text as the file has it, unnormalized and without the sections it lacks: where a line stands in it. */
	parse(text: string): TaskDocument {
		return parseText(text, this.settings.get());
	}

	/** The document after `operation` on `doc`, already read and normalized at `at`, normalized again. */
	changeOf(doc: TaskDocument, operation: Operation, at: Moment = this.moment()): TextChange {
		return this.written(doc, operation, at);
	}

	emptyFile(): string {
		return TaskDocument.empty(sectionNames(this.settings.get()));
	}

	entryOf(doc: TaskDocument, key: TaskKey): TaskEntry {
		const entry = doc.find(key.section, key.index, key.path);
		if (!entry || entry.raw !== key.raw) throw new StaleTaskError();
		return entry;
	}

	/** A section the UI names must still be in the file, as a task must. */
	groupOf(doc: TaskDocument, list: GroupedList, group: GroupName): number {
		const index = ops.groupIndex(doc, list, group);
		if (index < 0) throw new StaleTaskError();
		return index;
	}

	/** Section `name` of the task's list, null outside any; a task of Soon keeps its due date. A task of Done goes nowhere. */
	sectionChange(entry: TaskEntry, typed: GroupName): Extract<TaskChange, { readonly kind: "moveToGroup" | "createGroup" }> | null {
		const list = entry.section;
		const name = typed === null ? null : typed.trim();
		if (list === "done" || name === "" || entry.group === name) return null;
		const date = (list === "soon" ? entry.task.dueDate : null) ?? undefined;
		return name === null ? { kind: "moveToGroup", list, group: null, before: null, date } : { kind: "createGroup", list, name, date };
	}

	createInList(date: LocalDate, text: string): Operation | null {
		if (this.isBlank(text)) return null;
		return (doc, today) => ops.createInList(doc, date, today, text);
	}

	createInSoon(text: string): Operation | null {
		if (this.isBlank(text)) return null;
		return (doc) => ops.createInSoon(doc, text);
	}

	createAtTime(date: LocalDate, start: number, text: string): Operation | null {
		if (this.isBlank(text)) return null;
		return (doc, today, _settings, boundary) => ops.createAtTime(doc, date, today, start, text, boundary);
	}

	createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels: readonly string[] = []): Operation | null {
		if (this.isBlank(text)) return null;
		return this.placeNew(text, priority, place, repeat, labels);
	}

	/** A new task where `place` says, whatever its title: `createInPlace` without its check for a blank one. */
	placeNew(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels: readonly string[] = []): Operation {
		return (doc, today, _settings, boundary) => ops.createInPlace(doc, text, priority, this.resolve(doc, place, today), today, boundary, repeat, labels);
	}

	create(draft: TaskDraft, slot?: Slot): Operation | null {
		if (this.isBlank(draft.text)) return null;
		return (doc, today, _settings, boundary) => ops.placeTask(doc, null, draft, today, slot, boundary);
	}

	createSubtask(parent: TaskKey, draft: TaskDraft): Operation | null {
		if (this.isBlank(draft.text)) return null;
		return (doc, today) => ops.createSubtask(doc, this.entryOf(doc, parent), draft, today);
	}

	/** The task sheet's edit, and where the task stands after it (null before it ran); null for a blank title, a priority alone too. */
	edit(key: TaskKey, draft: TaskDraft): { readonly operation: Operation; place(): TaskKey | null } | null {
		if (this.isBlank(draft.text)) return null;
		let place: TaskKey | null = null;
		const operation: Operation = (doc, today, _settings, boundary) => {
			const { doc: tagged, tags } = EntryTags.tag(doc, [this.entryOf(doc, key)]);
			const entry = tags.find(tagged, 0)!;
			const edited = ops.placeTask(tagged, entry, { ...draft, text: EntryTags.marked(taskTitle(draft.text), 0) }, today, undefined, boundary);
			const moved = tags.find(edited, 0);
			place = moved && { section: moved.section, index: moved.index, path: moved.path, raw: "" };
			return tags.untag(edited);
		};
		return { operation, place: () => place };
	}

	setStatus(key: TaskKey, status: TaskStatus): Operation {
		return (doc) => ops.setStatus(doc, this.entryOf(doc, key), status);
	}

	setDueDate(key: TaskKey, date: LocalDate | null): Operation {
		return (doc) => ops.setDueDate(doc, this.entryOf(doc, key), date);
	}

	setPriority(key: TaskKey, priority: string | null): Operation {
		return (doc) => ops.setPriority(doc, this.entryOf(doc, key), priority);
	}

	/** Each step's labels on its task; `places` gives, after the operation ran, where each task then is (null for one gone). */
	setLabelsAll(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): { readonly operation: Operation; places(): readonly (TaskKey | null)[] } {
		let places: readonly (TaskKey | null)[] = [];
		const operation: Operation = (doc) => {
			const { doc: tagged, tags } = EntryTags.tag(doc, steps.map((step) => this.entryOf(doc, step.key)));
			let current = tagged;
			steps.forEach((step, n) => {
				const entry = tags.find(current, n);
				if (entry) current = ops.setLabels(current, entry, step.labels);
			});
			places = steps.map((_, n) => {
				const entry = tags.find(current, n);
				return entry ? { section: entry.section, index: entry.index, path: entry.path, raw: "" } : null;
			});
			return tags.untag(current);
		};
		return { operation, places: () => places };
	}

	setReminder(key: TaskKey, reminder: ReminderKind): Operation {
		return (doc) => ops.setReminder(doc, this.entryOf(doc, key), reminder);
	}

	/** The task's slot moved to `minutes` from now, keeping its length. */
	snooze(key: TaskKey, minutes: number): Operation {
		const now = this.clock.now();
		return (doc, today, _settings, boundary) => {
			const entry = this.entryOf(doc, key);
			return ops.setSlot(doc, entry, ops.snoozedSlot(entry.task.slot!, now, minutes), today, boundary);
		};
	}

	setCollapsed(key: TaskKey, collapsed: boolean): Operation {
		return (doc) => ops.setCollapsed(doc, this.entryOf(doc, key), collapsed);
	}

	toggleCollapsed(key: TaskKey): Operation {
		return (doc) => {
			const entry = this.entryOf(doc, key);
			return ops.setCollapsed(doc, entry, !entry.task.collapsed);
		};
	}

	unfoldAbove(key: TaskKey): Operation {
		return (doc) => ops.unfoldAbove(doc, this.entryOf(doc, key));
	}

	setRepeat(key: TaskKey, rule: RepeatRule | null): Operation {
		return (doc, today, _settings, boundary) => ops.setRepeat(doc, this.entryOf(doc, key), rule, today, boundary);
	}

	stop(key: TaskKey): Operation {
		return (doc) => ops.stop(doc, this.entryOf(doc, key));
	}

	/** The title as typed (`ops.rename`); null for a blank one, a priority alone too. */
	rename(key: TaskKey, text: string): Operation | null {
		if (this.isBlank(text)) return null;
		return (doc) => ops.rename(doc, this.entryOf(doc, key), text);
	}

	/** Whether `rename` writes anything on `doc`: not for a blank text, nor for the task's own title and marks. */
	renameChanges(doc: TaskDocument, key: TaskKey, text: string): boolean {
		return !this.isBlank(text) && ops.rename(doc, this.entryOf(doc, key), text) !== doc;
	}

	/** The circle of a task: done when it is open in the file, else open again. */
	toggleDone(key: TaskKey): Operation {
		return (doc) => ops.toggleDone(doc, this.entryOf(doc, key));
	}

	setDescription(key: TaskKey, markdown: string): Operation {
		return (doc) => ops.setDescription(doc, this.entryOf(doc, key), markdown);
	}

	remove(key: TaskKey): Operation {
		return (doc) => ops.remove(doc, this.entryOf(doc, key));
	}

	moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Operation {
		return (doc, today) => ops.moveBefore(doc, this.entryOf(doc, key), before ? this.entryOf(doc, before) : null, date, today);
	}

	nest(key: TaskKey, parent: TaskKey, before: TaskKey | null): Operation {
		return (doc) => ops.nest(doc, this.entryOf(doc, key), this.entryOf(doc, parent), before ? this.entryOf(doc, before) : null);
	}

	setSlot(key: TaskKey, slot: Slot): Operation {
		return (doc, today, _settings, boundary) => ops.setSlot(doc, this.entryOf(doc, key), slot, today, boundary);
	}

	clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Operation {
		return (doc, today) => {
			const entry = this.entryOf(doc, key);
			const before = place?.before ? this.entryOf(doc, place.before) : null;
			const cleared = ops.clearSlot(doc, entry);
			return place ? ops.moveBefore(cleared, cleared.tasks(entry.section)[entry.index], before && cleared.tasks(before.section)[before.index], place.date, today) : cleared;
		};
	}

	moveToList(key: TaskKey, date: LocalDate): Operation {
		return (doc, today) => ops.moveToList(doc, this.entryOf(doc, key), date, today);
	}

	moveToSoon(key: TaskKey, date: LocalDate): Operation {
		return (doc, today) => ops.moveToSoon(doc, this.entryOf(doc, key), date, today);
	}

	postpone(key: TaskKey, date: LocalDate): Operation {
		return (doc, today) => ops.postpone(doc, this.entryOf(doc, key), date, today);
	}

	moveToEnd(key: TaskKey, section: EndList): Operation {
		return (doc) => ops.moveToEnd(doc, this.entryOf(doc, key), section);
	}

	moveToGroup(key: TaskKey, list: GroupedList, group: GroupName, before: TaskKey | null, date?: LocalDate): Operation {
		return (doc, today) => {
			this.groupOf(doc, list, group);
			return ops.moveToGroup(doc, this.entryOf(doc, key), list, group, before ? this.entryOf(doc, before) : null, today, date ?? null);
		};
	}

	createGroup(key: TaskKey, list: GroupedList, name: string, date?: LocalDate): Operation | null {
		if (blankName(name)) return null;
		return (doc, today, settings) => ops.createGroup(doc, this.entryOf(doc, key), list, name, settings.groups, today, date ?? null);
	}

	moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Operation {
		return (doc) => {
			this.groupOf(doc, list, group);
			if (place !== "end") this.groupOf(doc, list, place.before);
			return ops.moveGroupTo(doc, list, group, place);
		};
	}

	/** Null for a blank name or the section's own: nothing to write. */
	renameGroup(list: GroupedList, group: string, name: string): Operation | null {
		if (blankName(name) || name.trim() === group) return null;
		return (doc, _today, settings) => {
			this.groupOf(doc, list, group);
			return ops.renameGroup(doc, list, group, name, settings.groups.ungrouped);
		};
	}

	removeGroup(list: GroupedList, group: string): Operation {
		return (doc) => {
			this.groupOf(doc, list, group);
			return ops.removeGroup(doc, list, group);
		};
	}

	/** A new section `name` at `place`, and the list it goes in; null when the name can't make one there. */
	createSection(name: string, place: SectionPlace): { readonly operation: Operation; readonly list: GroupedList; readonly group: string } | null {
		const group = name.trim();
		const today = this.today();
		const column = columnOfPlace(place, today);
		const list = columnList(column, today);
		if (list === null || group === "" || group === this.settings.get().groups.ungrouped || group === place.group) return null;
		const operation: Operation = (doc, today, settings, boundary) => {
			this.groupOf(doc, list, place.group);
			const before = place.before ? this.entryOf(doc, place.before) : null;
			const shown = columnGroups(doc, column, today, boundary).find((g) => g.name === place.group)?.entries ?? [];
			if (before && !shown.some((e) => e.section === before.section && e.index === before.index && e.path.length === 0)) throw new StaleTaskError();
			return ops.createSection(doc, column, place.group, before, group, settings.groups, today, boundary);
		};
		return { operation, list, group };
	}

	/** The steps in the file's order, each on its task wherever the earlier ones took it; a move under a task moved too goes along with it. */
	applyAll(steps: readonly TaskStep[]): Operation | null {
		if (steps.length === 0) return null;
		return (doc, today, settings) => {
			const named: TaskKey[] = [];
			const tagOf = (key: TaskKey): number => {
				const at = named.findIndex((k) => sameKey(k, key));
				return at >= 0 ? at : named.push(key) - 1;
			};
			const lineOf = (key: TaskKey) => doc.lineOf(this.entryOf(doc, key));
			const plan = steps
				.filter((step) => !(MOVES.has(step.change.kind) && steps.some((other) => MOVES.has(other.change.kind) && isUnder(step.key, other.key))))
				.sort((a, b) => lineOf(a.key) - lineOf(b.key))
				.map((step) => ({ change: step.change, own: tagOf(step.key), refs: refsOf(step.change).map((ref) => (ref === null ? null : tagOf(ref))) }));
			const { doc: tagged, tags } = EntryTags.tag(doc, named.map((key) => this.entryOf(doc, key)));
			let current = tagged;
			for (const { change, own, refs } of plan) {
				const entry = tags.find(current, own);
				if (!entry) continue;
				const [first, second] = refs.map((ref) => (ref === null ? null : tags.find(current, ref)));
				current = this.step(current, entry, change, first ?? null, second ?? null, today, settings);
			}
			return tags.untag(current);
		};
	}

	/** One step of `applyAll`; `first` and `second` are the tasks its change names, in the order `refsOf` gives them. */
	private step(doc: TaskDocument, entry: TaskEntry, change: TaskChange, first: TaskEntry | null, second: TaskEntry | null, today: LocalDate, settings: TaskCalendarSettings): TaskDocument {
		switch (change.kind) {
			case "status":
				return ops.setStatus(doc, entry, change.status);
			case "priority":
				return ops.setPriority(doc, entry, change.priority);
			case "labels":
				return ops.setLabels(doc, entry, change.labels);
			case "dueDate":
				return ops.setDueDate(doc, entry, change.date);
			case "postpone":
				return ops.postpone(doc, entry, change.date, today);
			case "remove":
				return ops.remove(doc, entry);
			case "stop":
				return ops.stop(doc, entry);
			case "moveBefore":
				return ops.moveBefore(doc, entry, first, change.date, today);
			case "moveToList":
				return ops.moveToList(doc, entry, change.date, today);
			case "moveToSoon":
				return ops.moveToSoon(doc, entry, change.date, today);
			case "moveToEnd":
				return ops.moveToEnd(doc, entry, change.section);
			case "moveToGroup":
				this.groupOf(doc, change.list, change.group);
				return ops.moveToGroup(doc, entry, change.list, change.group, first, today, change.date ?? null);
			case "createGroup":
				return blankName(change.name) ? doc : ops.createGroup(doc, entry, change.list, change.name, settings.groups, today, change.date ?? null);
			case "nest":
				return first ? ops.nest(doc, entry, first, second) : doc;
		}
	}

	private resolve(doc: TaskDocument, place: NewTaskPlace, today: LocalDate): ops.CreatePlace {
		const before = (key: TaskKey | null) => (key ? this.entryOf(doc, key) : null);
		switch (place.kind) {
			case "list":
				this.groupOf(doc, place.list, place.group);
				return { kind: "list", list: place.list, group: place.group, before: before(place.before), date: place.date ?? null };
			case "day": {
				const { list, date } = dayColumn(place.date, today);
				this.groupOf(doc, list, place.group);
				return { kind: "list", list, group: place.group, before: before(place.before), date };
			}
			case "subtask":
				return { kind: "subtask", parent: this.entryOf(doc, place.parent), before: before(place.before) };
			case "slot":
				return place;
		}
	}

	private written(doc: TaskDocument, operation: Operation, at: Moment): TextChange {
		const { settings, today, boundary } = at;
		const after = normalize(operation(doc, today, settings, boundary), today, boundary, ops.usablePresets(settings.groups.presets));
		return { text: after.serialize(), before: doc, after };
	}
}

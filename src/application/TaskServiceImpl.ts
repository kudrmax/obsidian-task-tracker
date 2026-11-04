import { DayBoundary } from "../domain/DayBoundary";
import { normalize } from "../domain/normalize";
import * as ops from "../domain/operations";
import { backlogList, dayList, inboxList, slottedOn, soonWithoutDate, toItem } from "../domain/queries";
import type { LocalDate, Slot, TaskStatus } from "../domain/Task";
import { TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { type PriorityLevel, type TaskCalendarSettings, usableLevels } from "../settings";
import {
	StaleTaskError,
	TasksFileMissingError,
	type DayView,
	type EndList,
	type GroupedList,
	type GroupName,
	type GroupPlace,
	type NewTaskPlace,
	type Placement,
	type RepeatRule,
	type TaskChange,
	type TaskDraft,
	type TaskItem,
	type TaskKey,
	type TaskService,
	type TaskStep,
} from "./contracts";
import { EntryTags } from "../domain/EntryTags";
import type { Clock, SettingsStore, TaskFileStore } from "./ports";
import type { UndoHistory } from "./UndoHistory";

/** The file's text read last, normalized: `changed` when normalizing it changes what the file says. */
interface Normalized {
	readonly text: string;
	readonly today: LocalDate;
	/** What of the settings the document is read and normalized by: another divider or zoom keeps it. */
	readonly reading: string;
	readonly doc: TaskDocument;
	readonly changed: boolean;
}

type Operation = (doc: TaskDocument, today: LocalDate, settings: TaskCalendarSettings, boundary: DayBoundary) => TaskDocument;

/** The changes that take a task elsewhere: its subtasks go along with it. */
const MOVES: ReadonlySet<TaskChange["kind"]> = new Set(["postpone", "moveBefore", "moveToList", "moveToSoon", "moveToEnd", "moveToGroup", "createGroup", "nest"]);

/** The other tasks a change names: the task to stand before, or the parent and the subtask to stand before. */
function refsOf(change: TaskChange): readonly (TaskKey | null)[] {
	if (change.kind === "moveBefore" || change.kind === "moveToGroup") return [change.before];
	if (change.kind === "nest") return [change.parent, change.before];
	return [];
}

function sameKey(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index && a.raw === b.raw && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
}

/** `a` is a task `b` sits under, at any depth. */
function isAncestor(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index && a.path.length < b.path.length && a.path.every((i, k) => b.path[k] === i);
}

function sectionNames(settings: TaskCalendarSettings): readonly string[] {
	const s = settings.sections;
	return [s.inbox, s.now, s.soon, s.backlog, s.done];
}

export class TaskServiceImpl implements TaskService {
	private readonly listeners = new Set<() => void>();
	private unsubscribeStore: (() => void) | null = null;
	private normalized: Normalized | null = null;

	constructor(
		private readonly store: TaskFileStore,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
		private readonly history: UndoHistory | null = null,
	) {}

	async dayView(date: LocalDate): Promise<DayView> {
		const { doc, today, boundary } = await this.readNormalized();
		const item = this.itemOf();
		return { date, list: dayList(doc, date, today, boundary).map(item), slotted: slottedOn(doc, date, boundary).map(item) };
	}

	async soonWithoutDateView(): Promise<readonly TaskItem[]> {
		const { doc } = await this.readNormalized();
		return soonWithoutDate(doc).map(this.itemOf());
	}

	async inboxView(): Promise<readonly TaskItem[]> {
		const { doc } = await this.readNormalized();
		return inboxList(doc).map(this.itemOf());
	}

	async backlogView(): Promise<readonly TaskItem[]> {
		const { doc } = await this.readNormalized();
		return backlogList(doc).map(this.itemOf());
	}

	async createInList(date: LocalDate, text: string): Promise<void> {
		if (this.blank(text)) return;
		await this.mutate((doc, today) => ops.createInList(doc, date, today, text));
	}

	async createInSoon(text: string): Promise<void> {
		if (this.blank(text)) return;
		await this.mutate((doc) => ops.createInSoon(doc, text));
	}

	async createAtTime(date: LocalDate, start: number, text: string): Promise<void> {
		if (this.blank(text)) return;
		await this.mutate((doc, today, _settings, boundary) => ops.createAtTime(doc, date, today, start, text, boundary));
	}

	async createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null): Promise<TaskKey | null> {
		if (this.blank(text)) return null;
		const change = await this.mutate((doc, today, _settings, boundary) => ops.createInPlace(doc, text, priority, this.resolve(doc, place), today, boundary, repeat));
		const created = change?.after.insertedSince(change.before);
		return created ? { section: created.section, index: created.index, path: created.path, raw: created.raw } : null;
	}

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today, _settings, boundary) => ops.placeTask(doc, null, draft, today, slot, boundary));
	}

	async createSubtask(parent: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today) => ops.createSubtask(doc, this.entryOf(doc, parent), draft, today));
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today, _settings, boundary) => ops.placeTask(doc, this.entryOf(doc, key), draft, today, undefined, boundary));
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate === this.boundary(this.settings.get()).dayOf(this.clock.now())) return { kind: "now" };
		if (item.dueDate !== null) return { kind: "date", date: item.dueDate };
		if (item.key.section === "inbox" || item.key.section === "backlog") return { kind: item.key.section };
		return item.key.section === "soon" ? { kind: "soon" } : { kind: "now" };
	}

	async setStatus(key: TaskKey, status: TaskStatus): Promise<void> {
		await this.mutate((doc) => ops.setStatus(doc, this.entryOf(doc, key), status));
	}

	async setDueDate(key: TaskKey, date: LocalDate | null): Promise<void> {
		await this.mutate((doc) => ops.setDueDate(doc, this.entryOf(doc, key), date));
	}

	async setPriority(key: TaskKey, priority: string | null): Promise<void> {
		await this.mutate((doc) => ops.setPriority(doc, this.entryOf(doc, key), priority));
	}

	async setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void> {
		await this.mutate((doc, today, _settings, boundary) => ops.setRepeat(doc, this.entryOf(doc, key), rule, today, boundary));
	}

	async stop(key: TaskKey): Promise<void> {
		await this.mutate((doc) => ops.stop(doc, this.entryOf(doc, key)));
	}

	async rename(key: TaskKey, text: string): Promise<void> {
		if (this.blank(text)) return;
		await this.mutate((doc) => ops.rename(doc, this.entryOf(doc, key), text));
	}

	async setDescription(key: TaskKey, markdown: string): Promise<void> {
		await this.mutate((doc) => ops.setDescription(doc, this.entryOf(doc, key), markdown));
	}

	async remove(key: TaskKey): Promise<void> {
		await this.mutate((doc) => ops.remove(doc, this.entryOf(doc, key)));
	}

	async lineOf(key: TaskKey): Promise<number> {
		await this.normalize();
		const settings = this.settings.get();
		const text = await this.store.read();
		if (text === null) throw new TasksFileMissingError(settings.tasksFile);
		const doc = this.parse(text, settings);
		return doc.lineOf(this.entryOf(doc, key));
	}

	async moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void> {
		await this.mutate((doc, today) =>
			ops.moveBefore(doc, this.entryOf(doc, key), before ? this.entryOf(doc, before) : null, date, today),
		);
	}

	async nest(key: TaskKey, parent: TaskKey, before: TaskKey | null): Promise<void> {
		await this.mutate((doc) => ops.nest(doc, this.entryOf(doc, key), this.entryOf(doc, parent), before ? this.entryOf(doc, before) : null));
	}

	async setSlot(key: TaskKey, slot: Slot): Promise<void> {
		await this.mutate((doc, today, _settings, boundary) => ops.setSlot(doc, this.entryOf(doc, key), slot, today, boundary));
	}

	async clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void> {
		await this.mutate((doc, today) => {
			const entry = this.entryOf(doc, key);
			const before = place?.before ? this.entryOf(doc, place.before) : null;
			const cleared = ops.clearSlot(doc, entry);
			return place ? ops.moveBefore(cleared, cleared.tasks(entry.section)[entry.index], before && cleared.tasks(before.section)[before.index], place.date, today) : cleared;
		});
	}

	async moveToList(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate((doc, today) => ops.moveToList(doc, this.entryOf(doc, key), date, today));
	}

	async moveToSoon(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate((doc, today) => ops.moveToSoon(doc, this.entryOf(doc, key), date, today));
	}

	async postpone(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate((doc, today) => ops.postpone(doc, this.entryOf(doc, key), date, today));
	}

	async moveToEnd(key: TaskKey, section: EndList): Promise<void> {
		await this.mutate((doc) => ops.moveToEnd(doc, this.entryOf(doc, key), section));
	}

	async moveToGroup(key: TaskKey, list: GroupedList, group: GroupName, before: TaskKey | null, date?: LocalDate): Promise<void> {
		await this.mutate((doc, today) => {
			this.groupOf(doc, list, group);
			return ops.moveToGroup(doc, this.entryOf(doc, key), list, group, before ? this.entryOf(doc, before) : null, today, date ?? null);
		});
	}

	async createGroup(key: TaskKey, list: GroupedList, name: string, date?: LocalDate): Promise<void> {
		if (this.blank(name)) return;
		await this.mutate((doc, today, settings) => ops.createGroup(doc, this.entryOf(doc, key), list, name, settings.groups, today, date ?? null));
	}

	async moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Promise<void> {
		await this.mutate((doc) => {
			this.groupOf(doc, list, group);
			if (place !== "end") this.groupOf(doc, list, place.before);
			return ops.moveGroupTo(doc, list, group, place);
		});
	}

	async renameGroup(list: GroupedList, group: string, name: string): Promise<void> {
		await this.mutate((doc, _today, settings) => {
			this.groupOf(doc, list, group);
			return ops.renameGroup(doc, list, group, name, settings.groups.ungrouped);
		});
	}

	async removeGroup(list: GroupedList, group: string): Promise<void> {
		await this.mutate((doc) => {
			this.groupOf(doc, list, group);
			return ops.removeGroup(doc, list, group);
		});
	}

	async applyAll(steps: readonly TaskStep[]): Promise<void> {
		if (steps.length === 0) return;
		await this.mutate((doc, today, settings) => {
			const named: TaskKey[] = [];
			const tagOf = (key: TaskKey): number => {
				const at = named.findIndex((k) => sameKey(k, key));
				return at >= 0 ? at : named.push(key) - 1;
			};
			const lineOf = (key: TaskKey) => doc.lineOf(this.entryOf(doc, key));
			const plan = steps
				.filter((step) => !(MOVES.has(step.change.kind) && steps.some((other) => MOVES.has(other.change.kind) && isAncestor(other.key, step.key))))
				.sort((a, b) => lineOf(a.key) - lineOf(b.key))
				.map((step) => ({ change: step.change, own: tagOf(step.key), refs: refsOf(step.change).map((ref) => (ref === null ? null : tagOf(ref))) }));
			const { doc: tagged, tags } = EntryTags.tag(doc, named.map((key) => this.entryOf(doc, key)));
			let current = tagged;
			for (const { change, own, refs } of plan) {
				const entry = tags.find(current, own);
				if (!entry) continue;
				const [first, second] = refs.map((ref) => (ref === null ? null : tags.find(current, ref)));
				current = this.change(current, entry, change, first ?? null, second ?? null, today, settings);
			}
			return tags.untag(current);
		});
	}

	/** One step of `applyAll`; `first` and `second` are the tasks its change names, in the order `refsOf` gives them. */
	private change(doc: TaskDocument, entry: TaskEntry, change: TaskChange, first: TaskEntry | null, second: TaskEntry | null, today: LocalDate, settings: TaskCalendarSettings): TaskDocument {
		switch (change.kind) {
			case "status":
				return ops.setStatus(doc, entry, change.status);
			case "priority":
				return ops.setPriority(doc, entry, change.priority);
			case "dueDate":
				return ops.setDueDate(doc, entry, change.date);
			case "postpone":
				return ops.postpone(doc, entry, change.date, today);
			case "remove":
				return ops.remove(doc, entry);
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
				return this.blank(change.name) ? doc : ops.createGroup(doc, entry, change.list, change.name, settings.groups, today, change.date ?? null);
			case "nest":
				return first ? ops.nest(doc, entry, first, second) : doc;
		}
	}

	async normalize(): Promise<void> {
		const text = await this.store.read();
		if (text === null) return;
		const settings = this.settings.get();
		const boundary = this.boundary(settings);
		if (!this.normalizedOf(text, settings, boundary.dayOf(this.clock.now()), boundary).changed) return;
		await this.mutate((d) => d, false);
	}

	async createFile(): Promise<void> {
		await this.store.create(TaskDocument.empty(sectionNames(this.settings.get())));
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		this.unsubscribeStore ??= this.store.onChange(() => this.emit());
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.unsubscribeStore?.();
				this.unsubscribeStore = null;
			}
		};
	}

	/** One action's change of the file; it is a step to take back unless `record` is false (the file tidied, not changed by an action). */
	/** The write, and the document as normalized before and after it; null when it changed nothing. */
	private async mutate(operation: Operation, record = true): Promise<{ readonly before: TaskDocument; readonly after: TaskDocument } | null> {
		const settings = this.settings.get();
		const boundary = this.boundary(settings);
		const today = boundary.dayOf(this.clock.now());
		let failure: unknown = null;
		let change = null as { before: string; after: string; was: TaskDocument; doc: TaskDocument } | null;
		await this.store.write((text) => {
			try {
				const presets = ops.usablePresets(settings.groups.presets);
				const doc = normalize(this.parse(text, settings).ensureSections(sectionNames(settings)), today, boundary, presets);
				const result = normalize(operation(doc, today, settings, boundary), today, boundary, presets);
				const after = result.serialize();
				change = { before: text, after, was: doc, doc: result };
				return after;
			} catch (e) {
				failure = e;
				return text;
			}
		});
		if (failure !== null) throw failure;
		if (!change) return null;
		this.normalized = { text: change.after, today, reading: this.readingOf(settings), doc: change.doc, changed: false };
		if (record) this.history?.record(change.before, change.after);
		return { before: change.was, after: change.doc };
	}

	private async readNormalized(): Promise<{ doc: TaskDocument; today: LocalDate; boundary: DayBoundary }> {
		const settings = this.settings.get();
		const text = await this.store.read();
		if (text === null) throw new TasksFileMissingError(settings.tasksFile);
		const boundary = this.boundary(settings);
		const today = boundary.dayOf(this.clock.now());
		return { doc: this.normalizedOf(text, settings, today, boundary).doc, today, boundary };
	}

	/** The text parsed and normalized, kept until the text, the day or the settings change. */
	private normalizedOf(text: string, settings: TaskCalendarSettings, today: LocalDate, boundary: DayBoundary): Normalized {
		const last = this.normalized;
		const reading = this.readingOf(settings);
		if (last && last.text === text && last.today === today && last.reading === reading) return last;
		const presets = ops.usablePresets(settings.groups.presets);
		const parsed = this.parse(text, settings);
		const whole = parsed.ensureSections(sectionNames(settings));
		const doc = normalize(whole, today, boundary, presets);
		const changed = whole === parsed ? doc !== whole : normalize(parsed, today, boundary, presets) !== parsed;
		this.normalized = { text, today, reading, doc, changed };
		return this.normalized;
	}

	private readingOf(settings: TaskCalendarSettings): string {
		const { sections, groups, dueDateMarker, slotMarker, repeatMarker, dayStartHour } = settings;
		const prefixes = this.levels(settings).map((l) => l.prefix);
		return JSON.stringify([sections, groups.ungrouped, groups.presets, dueDateMarker, slotMarker, repeatMarker, prefixes, dayStartHour]);
	}

	private parse(text: string, settings: TaskCalendarSettings): TaskDocument {
		const s = settings.sections;
		return TaskDocument.parse(
			text,
			{ inbox: s.inbox, backlog: s.backlog, now: s.now, soon: s.soon, done: s.done, ungrouped: settings.groups.ungrouped },
			{ dueDate: settings.dueDateMarker, slot: settings.slotMarker, repeat: settings.repeatMarker, priorities: this.levels(settings).map((l) => l.prefix) },
		);
	}

	private levels(settings: TaskCalendarSettings): readonly PriorityLevel[] {
		return usableLevels(settings.priorities);
	}

	private itemOf(): (entry: TaskEntry) => TaskItem {
		const levels = this.levels(this.settings.get());
		return (entry) => toItem(entry, (prefix) => levels.find((l) => l.prefix === prefix) ?? null);
	}

	/** A section the UI names must still be in the file, as a task must. */
	private groupOf(doc: TaskDocument, list: GroupedList, group: GroupName): number {
		const index = ops.groupIndex(doc, list, group);
		if (index < 0) throw new StaleTaskError();
		return index;
	}

	private resolve(doc: TaskDocument, place: NewTaskPlace): ops.CreatePlace {
		const before = (key: TaskKey | null) => (key ? this.entryOf(doc, key) : null);
		switch (place.kind) {
			case "list":
				this.groupOf(doc, place.list, place.group);
				return { kind: "list", list: place.list, group: place.group, before: before(place.before), date: place.date ?? null };
			case "subtask":
				return { kind: "subtask", parent: this.entryOf(doc, place.parent), before: before(place.before) };
			case "slot":
				return place;
		}
	}

	private entryOf(doc: TaskDocument, key: TaskKey): TaskEntry {
		const entry = doc.find(key.section, key.index, key.path);
		if (!entry || entry.raw !== key.raw) throw new StaleTaskError();
		return entry;
	}

	private boundary(settings: TaskCalendarSettings): DayBoundary {
		return new DayBoundary(settings.dayStartHour);
	}

	private blank(text: string): boolean {
		return text.trim() === "";
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

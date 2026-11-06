import { DayBoundary } from "../domain/DayBoundary";
import { dayColumn, dayOfPlacement, placementOfDay } from "../domain/Days";
import { isBlankTitle, priorityOfText, withPriority } from "../domain/Priority";
import { normalize } from "../domain/normalize";
import * as ops from "../domain/operations";
import { backlogList, type Column, columnGroups, columnList, dayList, inboxList, slottedOn, soonWithoutDate } from "../domain/queries";
import { FuzzyQuery, matchParts, plainDescription, snippetParts, type TextMatch } from "../domain/search";
import { plainText } from "../domain/TaskText";
import { isOpen, type LocalDate, type ReminderKind, type SectionKey, type Slot, type TaskStatus } from "../domain/Task";
import { descriptionMarkdown } from "../domain/description";
import { flatten, TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { type LabelLevel, type PriorityLevel, type TaskCalendarSettings, usableLabels, usableLevels } from "../settings";
import {
	StaleTaskError,
	TasksFileMissingError,
	type DayColumn,
	type DayView,
	type DroppedTask,
	type DropTo,
	type EndList,
	type GroupedList,
	type GroupName,
	type GroupPlace,
	type ListSection,
	type NewTaskPlace,
	type Placement,
	type RepeatRule,
	type ScreenView,
	type SectionPlace,
	type SearchHit,
	type TaskChange,
	type TaskDraft,
	type TaskItem,
	type TaskKey,
	type TaskService,
	type TaskStep,
} from "./contracts";
import { EntryTags } from "../domain/EntryTags";
import { runDrop } from "./drops";
import { offeredNames, type SectionOffer, shownSections } from "./sections";
import { boundaryOf, parseText, readDocument, sectionNames } from "./documentText";
import type { Clock, SettingsStore, TaskFileStore } from "./ports";
import { readsAnew } from "./readingSettings";
import { itemLevels, toItem } from "./taskItems";
import { sameLine, samePlace } from "./taskKeys";
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

const GROUPED_LISTS: readonly GroupedList[] = ["inbox", "backlog", "now", "soon"];

/** The column a section is written in from the field: a list's, or a later day's for Soon with a date. */
/** A list's sections with a heading or tasks, in file order; an empty one is a heading over no task. */
function sectionsOf(doc: TaskDocument, list: GroupedList): readonly ListSection[] {
	return doc
		.groups(list)
		.filter((g) => g.heading || g.entries.length > 0)
		.map((g) => ({ name: g.name, empty: g.name !== null && g.entries.length === 0 }));
}

function columnOfPlace(place: SectionPlace, today: LocalDate): Column {
	if (place.kind === "day") return { kind: "day", date: place.date };
	if (place.list === "now") return { kind: "day", date: place.date ?? today };
	if (place.list === "soon" && place.date !== undefined && place.date > today) return { kind: "day", date: place.date };
	return { kind: place.list };
}

/** The changes that take a task elsewhere: its subtasks go along with it. */
const MOVES: ReadonlySet<TaskChange["kind"]> = new Set(["postpone", "moveBefore", "moveToList", "moveToSoon", "moveToEnd", "moveToGroup", "createGroup", "nest"]);

/** The other tasks a change names: the task to stand before, or the parent and the subtask to stand before. */
/** The sections a search walks, in the order its results stand. */
const SEARCH_ORDER: readonly SectionKey[] = ["inbox", "backlog", "soon", "now", "done"];

interface RankedHit {
	readonly hit: SearchHit;
	readonly title: TextMatch | null;
	readonly description: TextMatch | null;
}

/** A match in the title before one only in the description, then the higher score; a sort keeps ties in file order. */
function byQuality(a: RankedHit, b: RankedHit): number {
	if ((a.title === null) !== (b.title === null)) return a.title ? -1 : 1;
	return (b.title ?? b.description)!.score - (a.title ?? a.description)!.score;
}

function refsOf(change: TaskChange): readonly (TaskKey | null)[] {
	if (change.kind === "moveBefore" || change.kind === "moveToGroup") return [change.before];
	if (change.kind === "nest") return [change.parent, change.before];
	return [];
}

/** The same task as read: its place and its line. */
function sameKey(a: TaskKey, b: TaskKey): boolean {
	return samePlace(a, b) && sameLine(a, b);
}

/** `a` is a task `b` sits under, at any depth. */
function isAncestor(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index && a.path.length < b.path.length && a.path.every((i, k) => b.path[k] === i);
}

export class TaskServiceImpl implements TaskService {
	private readonly listeners = new Set<() => void>();
	private unsubscribeStore: (() => void) | null = null;
	private unsubscribeSettings: (() => void) | null = null;
	private normalized: Normalized | null = null;

	constructor(
		private readonly store: TaskFileStore,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
		private readonly history: UndoHistory | null = null,
	) {}

	priorityLevels(): readonly PriorityLevel[] {
		return this.levels(this.settings.get());
	}

	labelLevels(): readonly LabelLevel[] {
		return usableLabels(this.settings.get().labels);
	}

	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null } {
		const levels = this.priorityLevels();
		const parsed = priorityOfText(text, levels.map((l) => l.prefix));
		return { text: parsed.text, priority: levels.find((l) => l.prefix === parsed.priority) ?? null };
	}

	isBlank(text: string): boolean {
		return isBlankTitle(text, this.prefixes());
	}

	withPriority(text: string, prefix: string | null): string {
		return withPriority(text, prefix, this.prefixes());
	}

	async screen(date: LocalDate): Promise<ScreenView> {
		await this.normalize();
		const [day, soon, inbox, backlog, done, sections, offer] = await Promise.all([this.dayView(date), this.soonWithoutDateView(), this.inboxView(), this.backlogView(), this.doneView(), this.listSections(), this.sectionOffer(date)]);
		return { day, soon, inbox, backlog, done, sections, offer };
	}

	async dayView(date: LocalDate): Promise<DayView> {
		const { doc, today, boundary } = await this.readNormalized();
		const item = this.itemOf(today);
		return { date, list: dayList(doc, date, today, boundary).map(item), slotted: slottedOn(doc, date, boundary).map(item) };
	}

	async soonWithoutDateView(): Promise<readonly TaskItem[]> {
		const { doc, today } = await this.readNormalized();
		return soonWithoutDate(doc).map(this.itemOf(today));
	}

	async inboxView(): Promise<readonly TaskItem[]> {
		const { doc, today } = await this.readNormalized();
		return inboxList(doc).map(this.itemOf(today));
	}

	async backlogView(): Promise<readonly TaskItem[]> {
		const { doc, today } = await this.readNormalized();
		return backlogList(doc).map(this.itemOf(today));
	}

	async sectionOffer(date: LocalDate): Promise<SectionOffer> {
		const { doc, today, boundary } = await this.readNormalized();
		const { presets, ungrouped } = this.settings.get().groups;
		const shown = [...dayList(doc, date, today, boundary), ...soonWithoutDate(doc), ...inboxList(doc), ...backlogList(doc)];
		const names = (list: GroupedList) =>
			offeredNames(shownSections(shown.filter((entry) => entry.section === list).map((entry) => entry.group), sectionsOf(doc, list)), presets, ungrouped);
		return { lists: { now: names("now"), soon: names("soon"), inbox: names("inbox"), backlog: names("backlog") }, ungrouped };
	}

	async listSections(): Promise<Readonly<Record<GroupedList, readonly ListSection[]>>> {
		const { doc } = await this.readNormalized();
		return Object.fromEntries(GROUPED_LISTS.map((list) => [list, sectionsOf(doc, list)])) as Record<GroupedList, readonly ListSection[]>;
	}

	async doneView(): Promise<readonly TaskItem[]> {
		const { doc, today } = await this.readNormalized();
		return doc.tasks("done").map(this.itemOf(today));
	}

	async search(query: string): Promise<readonly SearchHit[]> {
		const fuzzy = FuzzyQuery.of(query);
		if (!fuzzy) return [];
		const { doc, today } = await this.readNormalized();
		const item = this.itemOf(today);
		const ranked: RankedHit[] = [];
		const visit = (entry: TaskEntry): void => {
			const titleText = plainText(entry.task.text);
			const title = fuzzy.match(titleText);
			const markdown = descriptionMarkdown(entry);
			const descriptionText = markdown === null ? "" : plainDescription(markdown);
			const description = descriptionText === "" ? null : fuzzy.matchWords(descriptionText);
			if (title || description) {
				const hit: SearchHit = {
					item: item(entry),
					title: title ? matchParts(titleText, title.found) : [],
					description: description ? snippetParts(descriptionText, description.found) : null,
				};
				ranked.push({ hit, title, description });
			}
			for (const sub of entry.subtasks) if (isOpen(sub.task.status)) visit(sub);
		};
		const hits: SearchHit[] = [];
		for (const section of SEARCH_ORDER) {
			ranked.length = 0;
			for (const entry of doc.tasks(section)) visit(entry);
			hits.push(...ranked.sort(byQuality).map((r) => r.hit));
		}
		return hits;
	}

	async createInList(date: LocalDate, text: string): Promise<void> {
		if (this.isBlank(text)) return;
		await this.mutate((doc, today) => ops.createInList(doc, date, today, text));
	}

	async createInSoon(text: string): Promise<void> {
		if (this.isBlank(text)) return;
		await this.mutate((doc) => ops.createInSoon(doc, text));
	}

	async createAtTime(date: LocalDate, start: number, text: string): Promise<void> {
		if (this.isBlank(text)) return;
		await this.mutate((doc, today, _settings, boundary) => ops.createAtTime(doc, date, today, start, text, boundary));
	}

	async createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels: readonly string[] = []): Promise<TaskKey | null> {
		if (this.isBlank(text)) return null;
		const change = await this.mutate((doc, today, _settings, boundary) => ops.createInPlace(doc, text, priority, this.resolve(doc, place, today), today, boundary, repeat, labels));
		const created = change?.after.insertedSince(change.before);
		return created ? { section: created.section, index: created.index, path: created.path, raw: created.raw } : null;
	}

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		if (this.isBlank(draft.text)) return;
		await this.mutate((doc, today, _settings, boundary) => ops.placeTask(doc, null, draft, today, slot, boundary));
	}

	async createSubtask(parent: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.isBlank(draft.text)) return;
		await this.mutate((doc, today) => ops.createSubtask(doc, this.entryOf(doc, parent), draft, today));
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today, _settings, boundary) => ops.placeTask(doc, this.entryOf(doc, key), draft, today, undefined, boundary));
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate === this.today()) return { kind: "now" };
		if (item.dueDate !== null) return { kind: "date", date: item.dueDate };
		if (item.key.section === "inbox" || item.key.section === "backlog") return { kind: item.key.section };
		return item.key.section === "soon" ? { kind: "soon" } : { kind: "now" };
	}

	dayColumn(date: LocalDate): DayColumn {
		return dayColumn(date, this.today());
	}

	placementOfDay(date: LocalDate): Placement {
		return placementOfDay(date, this.today());
	}

	listName(list: GroupedList): string {
		return this.settings.get().sections[list];
	}

	dayOfPlacement(placement: Placement): LocalDate | null {
		return dayOfPlacement(placement, this.today());
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

	async setLabels(key: TaskKey, labels: readonly string[]): Promise<TaskItem | null> {
		const [item] = await this.setLabelsAll([{ key, labels }]);
		return item ?? null;
	}

	async setLabelsAll(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): Promise<readonly (TaskItem | null)[]> {
		if (steps.length === 0) return [];
		let places: readonly (TaskKey | null)[] = [];
		const change = await this.mutate((doc) => {
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
		});
		if (!change) return steps.map(() => null);
		const settings = this.settings.get();
		const today = this.boundary(settings).dayOf(this.clock.now());
		const levels = itemLevels(this.levels(settings), usableLabels(settings.labels));
		return places.map((place) => {
			const entry = place && change.after.find(place.section, place.index, place.path);
			if (!place || !entry) return null;
			const parent = place.path.length > 0 ? change.after.find(place.section, place.index, place.path.slice(0, -1)) : undefined;
			return toItem(entry, today, levels, parent?.task.text ?? null);
		});
	}

	async setReminder(key: TaskKey, reminder: ReminderKind): Promise<void> {
		await this.mutate((doc) => ops.setReminder(doc, this.entryOf(doc, key), reminder));
	}

	async setCollapsed(key: TaskKey, collapsed: boolean): Promise<void> {
		await this.mutate((doc) => ops.setCollapsed(doc, this.entryOf(doc, key), collapsed));
	}

	async unfoldAbove(key: TaskKey): Promise<void> {
		await this.mutate((doc) => ops.unfoldAbove(doc, this.entryOf(doc, key)));
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

	async find(key: TaskKey, text: string): Promise<TaskItem | null> {
		const { doc, today } = await this.readNormalized();
		const atPlace = doc.find(key.section, key.index, key.path);
		const alike = flatten(doc.allTasks()).filter((entry) => entry.raw === key.raw);
		const entry = atPlace?.raw === key.raw ? atPlace : alike.length === 1 ? alike[0] : atPlace?.task.text === text ? atPlace : undefined;
		if (!entry) return null;
		const parent = entry.path.length > 0 ? doc.find(entry.section, entry.index, entry.path.slice(0, -1)) : undefined;
		const settings = this.settings.get();
		return toItem(entry, today, itemLevels(this.levels(settings), usableLabels(settings.labels)), parent?.task.text ?? null);
	}

	async lineOf(key: TaskKey): Promise<number> {
		await this.normalize();
		const settings = this.settings.get();
		const text = await this.store.read();
		if (text === null) throw new TasksFileMissingError(settings.tasksFile);
		const doc = parseText(text, settings);
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

	async toSection(keys: readonly TaskKey[], name: GroupName): Promise<void> {
		const { doc } = await this.readNormalized();
		const steps = keys.flatMap((key): TaskStep[] => {
			const change = this.sectionChange(this.entryOf(doc, key), name);
			return change ? [{ key, change }] : [];
		});
		if (steps.length === 0) return;
		if (keys.length !== 1) return this.applyAll(steps);
		const { key, change } = steps[0];
		if (change.kind === "moveToGroup") return this.moveToGroup(key, change.list, change.group, change.before, change.date);
		if (change.kind === "createGroup") return this.createGroup(key, change.list, change.name, change.date);
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

	async createSection(name: string, place: SectionPlace): Promise<{ readonly list: GroupedList; readonly group: string } | null> {
		const group = name.trim();
		const column = columnOfPlace(place, this.today());
		const list = columnList(column, this.today());
		if (list === null || group === "" || group === this.settings.get().groups.ungrouped || group === place.group) return null;
		const change = await this.mutate((doc, today, settings, boundary) => {
			this.groupOf(doc, list, place.group);
			const before = place.before ? this.entryOf(doc, place.before) : null;
			const shown = columnGroups(doc, column, today, boundary).find((g) => g.name === place.group)?.entries ?? [];
			if (before && !shown.some((e) => e.section === before.section && e.index === before.index && e.path.length === 0)) throw new StaleTaskError();
			return ops.createSection(doc, column, place.group, before, group, settings.groups, today, boundary);
		});
		if (!change || change.after.serialize() === change.before.serialize()) return null;
		return { list, group };
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

	drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void> {
		return runDrop(this, tasks, to, day);
	}

	/** One step of `applyAll`; `first` and `second` are the tasks its change names, in the order `refsOf` gives them. */
	private change(doc: TaskDocument, entry: TaskEntry, change: TaskChange, first: TaskEntry | null, second: TaskEntry | null, today: LocalDate, settings: TaskCalendarSettings): TaskDocument {
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
		this.unsubscribeSettings ??= this.watchReading();
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.unsubscribeStore?.();
				this.unsubscribeStore = null;
				this.unsubscribeSettings?.();
				this.unsubscribeSettings = null;
			}
		};
	}

	/** Settings that change how the file reads change what it says: the listeners read it anew. */
	private watchReading(): () => void {
		let seen = this.settings.get();
		return this.settings.onChange(() => {
			const now = this.settings.get();
			const anew = readsAnew(seen, now);
			seen = now;
			if (anew) this.emit();
		});
	}

	/**
	 * One action's change of the file; it is a step to take back unless `record` is false (the file tidied, not changed by an
	 * action). Gives the document as normalized before and after the write; null when it changed nothing.
	 */
	private async mutate(operation: Operation, record = true): Promise<{ readonly before: TaskDocument; readonly after: TaskDocument } | null> {
		const settings = this.settings.get();
		const boundary = this.boundary(settings);
		const today = boundary.dayOf(this.clock.now());
		let failure: unknown = null;
		let change = null as { before: string; after: string; was: TaskDocument; doc: TaskDocument } | null;
		await this.store.write((text) => {
			try {
				const doc = readDocument(text, settings, today, boundary);
				const result = normalize(operation(doc, today, settings, boundary), today, boundary, ops.usablePresets(settings.groups.presets));
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
		const parsed = parseText(text, settings);
		const whole = parsed.ensureSections(sectionNames(settings));
		const doc = normalize(whole, today, boundary, presets);
		const changed = whole === parsed ? doc !== whole : normalize(parsed, today, boundary, presets) !== parsed;
		this.normalized = { text, today, reading, doc, changed };
		return this.normalized;
	}

	private readingOf(settings: TaskCalendarSettings): string {
		const { sections, groups, dueDateMarker, slotMarker, alarmSlotMarker, liveSlotMarker, silentSlotMarker, repeatMarker, collapsedMarker, dayStartHour, labelTag } = settings;
		const prefixes = this.levels(settings).map((l) => l.prefix);
		const labels = usableLabels(settings.labels).map((l) => l.name);
		return JSON.stringify([sections, groups.ungrouped, groups.presets, dueDateMarker, slotMarker, alarmSlotMarker, liveSlotMarker, silentSlotMarker, repeatMarker, collapsedMarker, prefixes, labelTag, labels, dayStartHour]);
	}

	private levels(settings: TaskCalendarSettings): readonly PriorityLevel[] {
		return usableLevels(settings.priorities);
	}

	private prefixes(): readonly string[] {
		return this.priorityLevels().map((l) => l.prefix);
	}

	private itemOf(today: LocalDate): (entry: TaskEntry) => TaskItem {
		const settings = this.settings.get();
		const levels = itemLevels(this.levels(settings), usableLabels(settings.labels));
		return (entry) => toItem(entry, today, levels);
	}

	/** Section `name` of the task's list, null outside any; a task of Soon keeps its due date. A task of Done goes nowhere. */
	private sectionChange(entry: TaskEntry, name: GroupName): Extract<TaskChange, { readonly kind: "moveToGroup" | "createGroup" }> | null {
		const list = entry.section;
		if (list === "done" || entry.group === name) return null;
		const date = (list === "soon" ? entry.task.dueDate : null) ?? undefined;
		return name === null ? { kind: "moveToGroup", list, group: null, before: null, date } : { kind: "createGroup", list, name, date };
	}

	/** A section the UI names must still be in the file, as a task must. */
	private groupOf(doc: TaskDocument, list: GroupedList, group: GroupName): number {
		const index = ops.groupIndex(doc, list, group);
		if (index < 0) throw new StaleTaskError();
		return index;
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

	private entryOf(doc: TaskDocument, key: TaskKey): TaskEntry {
		const entry = doc.find(key.section, key.index, key.path);
		if (!entry || entry.raw !== key.raw) throw new StaleTaskError();
		return entry;
	}

	private today(): LocalDate {
		return this.boundary(this.settings.get()).dayOf(this.clock.now());
	}

	private boundary(settings: TaskCalendarSettings): DayBoundary {
		return boundaryOf(settings);
	}

	private blank(text: string): boolean {
		return text.trim() === "";
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

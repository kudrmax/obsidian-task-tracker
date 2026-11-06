import type { DayBoundary } from "../domain/DayBoundary";
import { dayColumn, dayOfPlacement, dayOfTask, placementOfDay, type TaskScreen, taskScreen } from "../domain/Days";
import { markChoices, typedMarks } from "../domain/Marks";
import { priorityOfTitle, withPriority } from "../domain/Priority";
import { backlogList, dayList, inboxList, slottedOn, soonWithoutDate } from "../domain/queries";
import { FuzzyQuery, matchParts, plainDescription, snippetParts, type TextMatch } from "../domain/search";
import { plainText } from "../domain/TaskText";
import { isOpen, type LocalDate, type ReminderKind, type SectionKey, type Slot, type TaskStatus } from "../domain/Task";
import { descriptionMarkdown } from "../domain/description";
import { flatten, type TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { type LabelLevel, type PriorityLevel, type TaskCalendarSettings, usableLabels, usableLevels } from "../settings";
import {
	TasksFileMissingError,
	type ColumnSections,
	type DayColumn,
	type DropColumn,
	type SearchGroup,
	type DaySpan,
	type DayView,
	type DraftMarks,
	type DroppedTask,
	type DropFrom,
	type DropOrigin,
	type FullTree,
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
	type TaskDraft,
	type TaskItem,
	type TaskKey,
	type TaskMenuModel,
	type TaskService,
	type TaskStep,
} from "./contracts";
import { carriedWith, taskMenu, toggledLabels, toggledPriority } from "./menus";
import { runDrop } from "./drops";
import { samePlace } from "./taskKeys";
import { offeredNames, type SectionOffer, shownSections } from "./sections";
import { parseText } from "./documentText";
import type { Clock, SettingsStore, TaskFileStore } from "./ports";
import { readsAnew } from "./readingSettings";
import { fullTree } from "./fullTree";
import { type ItemLevels, itemLevels, toItem } from "./taskItems";
import { type Moment, type Operation, TaskRules, type TextChange } from "./TaskRules";
import type { UndoHistory } from "./UndoHistory";
import { droppedSpan, type ResizeEdge, type SlottedTask, type StretchSpan, TimelineSpans } from "./TimelineSpans";

/** The file's text read last, normalized: `changed` when normalizing it changes what the file says. */
interface Normalized {
	readonly text: string;
	readonly today: LocalDate;
	/** What of the settings the document is read and normalized by: another divider or zoom keeps it. */
	readonly reading: string;
	readonly doc: TaskDocument;
	readonly changed: boolean;
}

const GROUPED_LISTS: readonly GroupedList[] = ["inbox", "backlog", "now", "soon"];

/** A list's sections with a heading or tasks, in file order; an empty one is a heading over no task. */
function sectionsOf(doc: TaskDocument, list: GroupedList): readonly ListSection[] {
	return doc
		.groups(list)
		.filter((g) => g.heading || g.entries.length > 0)
		.map((g) => ({ name: g.name, empty: g.name !== null && g.entries.length === 0 }));
}

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

export class TaskServiceImpl implements TaskService {
	private readonly listeners = new Set<() => void>();
	private unsubscribeStore: (() => void) | null = null;
	private unsubscribeSettings: (() => void) | null = null;
	private normalized: Normalized | null = null;
	private readonly rules: TaskRules;

	constructor(
		private readonly store: TaskFileStore,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
		private readonly history: UndoHistory | null = null,
	) {
		this.rules = new TaskRules(settings, clock);
	}

	priorityLevels(): readonly PriorityLevel[] {
		return this.rules.priorityLevels();
	}

	labelLevels(): readonly LabelLevel[] {
		return usableLabels(this.settings.get().labels);
	}

	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null } {
		const levels = this.priorityLevels();
		const parsed = priorityOfTitle(text, levels.map((l) => l.prefix));
		return { text: parsed.text, priority: levels.find((l) => l.prefix === parsed.priority) ?? null };
	}

	draftMarks(text: string, priority: string | null, labels: readonly string[]): DraftMarks {
		const marks = typedMarks(text, priority, labels, this.priorityLevels().map((l) => l.prefix));
		const choices = markChoices(marks);
		return {
			priority: this.priorityLevels().find((l) => l.prefix === marks.priority) ?? null,
			labels: this.labelLevels().filter((l) => marks.labels.includes(l.name)),
			can: { setPriority: choices.priority, setLabels: choices.labels },
		};
	}

	isBlank(text: string): boolean {
		return this.rules.isBlank(text);
	}

	withPriority(text: string, prefix: string | null): string {
		return withPriority(text, prefix, this.priorityLevels().map((l) => l.prefix));
	}

	async screen(date: LocalDate): Promise<ScreenView> {
		try {
			await this.normalize();
			const [day, soon, inbox, backlog, done, sections, offer] = await Promise.all([this.dayView(date), this.soonWithoutDateView(), this.inboxView(), this.backlogView(), this.doneView(), this.listSections(), this.sectionOffer(date)]);
			return { day, soon, inbox, backlog, done, sections, offer, missing: false, calendars: true };
		} catch (error) {
			if (error instanceof TasksFileMissingError) return this.missingScreen(date);
			throw error;
		}
	}

	/** The screen without a tasks file: nothing in any list, and no calendars beside nothing. */
	private missingScreen(date: LocalDate): ScreenView {
		const none = { inbox: [], backlog: [], soon: [], now: [] };
		return {
			day: { date, list: [], slotted: [] },
			soon: [],
			inbox: [],
			backlog: [],
			done: [],
			sections: none,
			offer: { lists: none, ungrouped: this.settings.get().groups.ungrouped },
			missing: true,
			calendars: false,
		};
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

	async search(query: string): Promise<readonly SearchGroup[]> {
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
		const groups: SearchGroup[] = [];
		for (const list of SEARCH_ORDER) {
			ranked.length = 0;
			for (const entry of doc.tasks(list)) visit(entry);
			if (ranked.length > 0) groups.push({ list, hits: ranked.sort(byQuality).map((r) => r.hit) });
		}
		return groups;
	}

	async screenOf(item: TaskItem): Promise<TaskScreen> {
		const { doc, today } = await this.readNormalized();
		const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : undefined;
		return top ? taskScreen(top.section, dayOfTask(top.section, top.task, today)) : taskScreen(item.list, item.day);
	}

	async reveal(item: TaskItem): Promise<TaskScreen> {
		if (item.isSubtask) await this.unfoldAbove(item.key);
		return this.screenOf(item);
	}

	findIn(items: readonly TaskItem[], key: TaskKey): TaskItem | null {
		for (const item of items) {
			if (samePlace(item.key, key)) return item;
			const inner = this.findIn(item.subtasks, key);
			if (inner) return inner;
		}
		return null;
	}

	async createInList(date: LocalDate, text: string): Promise<void> {
		await this.mutate(this.rules.createInList(date, text));
	}

	async createInSoon(text: string): Promise<void> {
		await this.mutate(this.rules.createInSoon(text));
	}

	async createAtTime(date: LocalDate, start: number, text: string): Promise<void> {
		await this.mutate(this.rules.createAtTime(date, start, text));
	}

	async createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels: readonly string[] = []): Promise<TaskKey | null> {
		const change = await this.mutate(this.rules.createInPlace(text, priority, place, repeat, labels));
		const created = change?.after.insertedSince(change.before);
		return created ? { section: created.section, index: created.index, path: created.path, raw: created.raw } : null;
	}

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		await this.mutate(this.rules.create(draft, slot));
	}

	async createSubtask(parent: TaskKey, draft: TaskDraft): Promise<void> {
		await this.mutate(this.rules.createSubtask(parent, draft));
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<void> {
		await this.mutate(this.rules.edit(key, draft));
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

	columnSections(column: DropColumn, date: LocalDate): ColumnSections | null {
		if (column !== "day") return { list: column, date: null };
		const { list, date: day, sections } = this.dayColumn(date);
		return sections ? { list, date: day } : null;
	}

	placementOfDay(date: LocalDate): Placement {
		return placementOfDay(date, this.today());
	}

	listName(list: SectionKey): string {
		return this.settings.get().sections[list];
	}

	dayOfPlacement(placement: Placement): LocalDate | null {
		return dayOfPlacement(placement, this.today());
	}

	async setStatus(key: TaskKey, status: TaskStatus): Promise<void> {
		await this.mutate(this.rules.setStatus(key, status));
	}

	async setDueDate(key: TaskKey, date: LocalDate | null): Promise<void> {
		await this.mutate(this.rules.setDueDate(key, date));
	}

	async setPriority(key: TaskKey, priority: string | null): Promise<void> {
		await this.mutate(this.rules.setPriority(key, priority));
	}

	async setLabels(key: TaskKey, labels: readonly string[]): Promise<TaskItem | null> {
		const [item] = await this.setLabelsAll([{ key, labels }]);
		return item ?? null;
	}

	async setLabelsAll(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): Promise<readonly (TaskItem | null)[]> {
		if (steps.length === 0) return [];
		const labelled = this.rules.setLabelsAll(steps);
		const change = await this.mutate(labelled.operation);
		if (!change) return steps.map(() => null);
		const today = this.rules.today();
		const levels = this.itemLevels();
		return labelled.places().map((place) => (place ? this.itemAt(change.after, place, today, levels) : null));
	}

	async togglePriority(keys: readonly TaskKey[], prefix: string): Promise<void> {
		if (keys.length === 0) return;
		const priority = toggledPriority(await this.itemsAt(keys), prefix);
		if (keys.length === 1) return this.setPriority(keys[0], priority);
		await this.applyAll(keys.map((key) => ({ key, change: { kind: "priority", priority } })));
	}

	async toggleLabel(keys: readonly TaskKey[], name: string): Promise<readonly (TaskItem | null)[]> {
		if (keys.length === 0) return [];
		const labels = toggledLabels(await this.itemsAt(keys), name);
		return this.setLabelsAll(keys.map((key, i) => ({ key, labels: labels[i] })));
	}

	async removeDue(keys: readonly TaskKey[]): Promise<void> {
		const items = await this.itemsAt(keys);
		const steps = items.flatMap((item): TaskStep[] => (item.can.removeDue ? [{ key: item.key, change: { kind: "dueDate", date: null } }] : []));
		if (steps.length === 0) return;
		if (keys.length === 1) return this.setDueDate(steps[0].key, null);
		await this.applyAll(steps);
	}

	menu(items: readonly TaskItem[], today: LocalDate, offer: SectionOffer | null = null): TaskMenuModel {
		return taskMenu(items, today, this.priorityLevels(), this.labelLevels(), offer);
	}

	carried(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[] {
		return carriedWith(lifted, picked);
	}

	/** The tasks the keys name as the file now has them, in their order; rejects with StaleTaskError when one is gone. */
	private async itemsAt(keys: readonly TaskKey[]): Promise<readonly TaskItem[]> {
		const { doc, today } = await this.readNormalized();
		const levels = this.itemLevels();
		return keys.map((key) => {
			const entry = this.rules.entryOf(doc, key);
			const parent = key.path.length > 0 ? (doc.find(key.section, key.index, key.path.slice(0, -1)) ?? null) : null;
			return toItem(entry, today, levels, parent);
		});
	}

	async setReminder(key: TaskKey, reminder: ReminderKind): Promise<void> {
		await this.mutate(this.rules.setReminder(key, reminder));
	}

	async setCollapsed(key: TaskKey, collapsed: boolean): Promise<void> {
		await this.mutate(this.rules.setCollapsed(key, collapsed));
	}

	async unfoldAbove(key: TaskKey): Promise<void> {
		await this.mutate(this.rules.unfoldAbove(key));
	}

	async setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void> {
		await this.mutate(this.rules.setRepeat(key, rule));
	}

	async stop(key: TaskKey): Promise<void> {
		await this.mutate(this.rules.stop(key));
	}

	async toggleDone(key: TaskKey): Promise<void> {
		await this.mutate(this.rules.toggleDone(key));
	}

	async rename(key: TaskKey, text: string): Promise<TaskItem | null> {
		const { doc, today } = await this.readNormalized();
		if (!this.rules.renameChanges(doc, key, text)) return null;
		const change = await this.mutate(this.rules.rename(key, text));
		return change && this.itemAt(change.after, key, today, this.itemLevels());
	}

	fullTree(item: TaskItem): FullTree {
		return fullTree(item);
	}

	async setDescription(key: TaskKey, markdown: string): Promise<void> {
		await this.mutate(this.rules.setDescription(key, markdown));
	}

	async remove(key: TaskKey): Promise<void> {
		await this.mutate(this.rules.remove(key));
	}

	async find(key: TaskKey, text: string): Promise<TaskItem | null> {
		const { doc, today } = await this.readNormalized();
		const atPlace = doc.find(key.section, key.index, key.path);
		const alike = flatten(doc.allTasks()).filter((entry) => entry.raw === key.raw);
		const entry = atPlace?.raw === key.raw ? atPlace : alike.length === 1 ? alike[0] : atPlace?.task.text === text ? atPlace : undefined;
		return entry ? this.itemAt(doc, entry, today, this.itemLevels()) : null;
	}

	/** The task at `place` in `doc` as the UI sees it, with the task it sits under; null when none stands there. */
	private itemAt(doc: TaskDocument, place: Pick<TaskKey, "section" | "index" | "path">, today: LocalDate, levels: ItemLevels): TaskItem | null {
		const entry = doc.find(place.section, place.index, place.path);
		if (!entry) return null;
		const parent = place.path.length > 0 ? (doc.find(place.section, place.index, place.path.slice(0, -1)) ?? null) : null;
		return toItem(entry, today, levels, parent, this.rules.moment().boundary);
	}

	async lineOf(key: TaskKey): Promise<number> {
		await this.normalize();
		const settings = this.settings.get();
		const text = await this.store.read();
		if (text === null) throw new TasksFileMissingError(settings.tasksFile);
		const doc = parseText(text, settings);
		return doc.lineOf(this.rules.entryOf(doc, key));
	}

	async moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void> {
		await this.mutate(this.rules.moveBefore(key, before, date));
	}

	async nest(key: TaskKey, parent: TaskKey, before: TaskKey | null): Promise<void> {
		await this.mutate(this.rules.nest(key, parent, before));
	}

	async setSlot(key: TaskKey, slot: Slot): Promise<void> {
		await this.mutate(this.rules.setSlot(key, slot));
	}

	shownSpan(item: TaskItem, day: LocalDate): DaySpan {
		return this.timeline().shown(slotted(item), day);
	}

	dropSpan(item: TaskItem | null, from: DropOrigin, start: number): DaySpan {
		return droppedSpan(start, from === "timeline" ? (item?.durationMin ?? null) : null);
	}

	newSlot(day: LocalDate, start: number): Slot {
		return this.rules.moment().boundary.slotAt(day, droppedSpan(start, null).start, null);
	}

	/** A drop on the timeline of `day` at `start`: the task's own duration from the file when it came from the timeline. */
	async toTime(key: TaskKey, from: DropFrom, start: number, day: LocalDate): Promise<void> {
		const { doc, boundary } = await this.readNormalized();
		const { slot } = this.rules.entryOf(doc, key).task;
		const span = droppedSpan(start, from === "timeline" && slot && slot.end !== null ? slot.end - slot.start : null);
		await this.setSlot(key, boundary.slotAt(day, span.start, span.end));
	}

	stretch(item: TaskItem, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan {
		return this.timeline().stretched(slotted(item), day, edge, minute);
	}

	async resize(key: TaskKey, day: LocalDate, edge: ResizeEdge, minute: number, minDurationMin: number): Promise<boolean> {
		const { doc, boundary } = await this.readNormalized();
		const { slot, status } = this.rules.entryOf(doc, key).task;
		const next = slot && new TimelineSpans(boundary, this.clock.now()).resized({ slot, open: isOpen(status) }, day, edge, minute, minDurationMin);
		if (!next) return false;
		await this.setSlot(key, next);
		return true;
	}

	async clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void> {
		await this.mutate(this.rules.clearSlot(key, place));
	}

	async moveToList(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate(this.rules.moveToList(key, date));
	}

	async moveToSoon(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate(this.rules.moveToSoon(key, date));
	}

	async postpone(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate(this.rules.postpone(key, date));
	}

	async moveToEnd(key: TaskKey, section: EndList): Promise<void> {
		await this.mutate(this.rules.moveToEnd(key, section));
	}

	async moveToGroup(key: TaskKey, list: GroupedList, group: GroupName, before: TaskKey | null, date?: LocalDate): Promise<void> {
		await this.mutate(this.rules.moveToGroup(key, list, group, before, date));
	}

	async createGroup(key: TaskKey, list: GroupedList, name: string, date?: LocalDate): Promise<void> {
		await this.mutate(this.rules.createGroup(key, list, name, date));
	}

	async toSection(keys: readonly TaskKey[], name: GroupName): Promise<void> {
		const { doc } = await this.readNormalized();
		const steps = keys.flatMap((key): TaskStep[] => {
			const change = this.rules.sectionChange(this.rules.entryOf(doc, key), name);
			return change ? [{ key, change }] : [];
		});
		if (steps.length === 0) return;
		if (keys.length !== 1) return this.applyAll(steps);
		const { key, change } = steps[0];
		if (change.kind === "moveToGroup") return this.moveToGroup(key, change.list, change.group, change.before, change.date);
		if (change.kind === "createGroup") return this.createGroup(key, change.list, change.name, change.date);
	}

	async moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Promise<void> {
		await this.mutate(this.rules.moveGroup(list, group, place));
	}

	async renameGroup(list: GroupedList, group: string, name: string): Promise<boolean> {
		const operation = this.rules.renameGroup(list, group, name);
		if (!operation) return false;
		const { doc, today, boundary } = await this.readNormalized();
		if (operation(doc, today, this.settings.get(), boundary) === doc) return false;
		await this.mutate(operation);
		return true;
	}

	async removeGroup(list: GroupedList, group: string): Promise<void> {
		await this.mutate(this.rules.removeGroup(list, group));
	}

	async createSection(name: string, place: SectionPlace): Promise<{ readonly list: GroupedList; readonly group: string } | null> {
		const made = this.rules.createSection(name, place);
		if (!made) return null;
		const change = await this.mutate(made.operation);
		if (!change || change.after.serialize() === change.before.serialize()) return null;
		return { list: made.list, group: made.group };
	}

	async applyAll(steps: readonly TaskStep[]): Promise<void> {
		await this.mutate(this.rules.applyAll(steps));
	}

	drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void> {
		return runDrop(this, tasks, to, day);
	}

	async normalize(): Promise<void> {
		const text = await this.store.read();
		if (text === null) return;
		if (!this.normalizedOf(text, this.rules.moment()).changed) return;
		await this.mutate((d) => d, false);
	}

	async createFile(): Promise<void> {
		await this.store.create(this.rules.emptyFile());
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
	private async mutate(operation: Operation | null, record = true): Promise<{ readonly before: TaskDocument; readonly after: TaskDocument } | null> {
		if (!operation) return null;
		const at = this.rules.moment();
		let failure: unknown = null;
		let change = null as { before: string; written: TextChange } | null;
		await this.store.write((text) => {
			try {
				const written = this.rules.change(text, operation, at);
				change = { before: text, written };
				return written.text;
			} catch (e) {
				failure = e;
				return text;
			}
		});
		if (failure !== null) throw failure;
		if (!change) return null;
		const { before, written } = change;
		this.normalized = { text: written.text, today: at.today, reading: at.reading, doc: written.after, changed: false };
		if (record) this.history?.record(before, written.text);
		return { before: written.before, after: written.after };
	}

	private async readNormalized(): Promise<{ doc: TaskDocument; today: LocalDate; boundary: DayBoundary }> {
		const at = this.rules.moment();
		const text = await this.store.read();
		if (text === null) throw new TasksFileMissingError(at.settings.tasksFile);
		return { doc: this.normalizedOf(text, at).doc, today: at.today, boundary: at.boundary };
	}

	/** The text parsed and normalized, kept until the text, the day or the settings it is read by change. */
	private normalizedOf(text: string, at: Moment): Normalized {
		const last = this.normalized;
		if (last && last.text === text && last.today === at.today && last.reading === at.reading) return last;
		const { doc, changed } = this.rules.read(text, at);
		this.normalized = { text, today: at.today, reading: at.reading, doc, changed };
		return this.normalized;
	}

	private levels(settings: TaskCalendarSettings): readonly PriorityLevel[] {
		return usableLevels(settings.priorities);
	}

	private itemOf(today: LocalDate): (entry: TaskEntry) => TaskItem {
		const levels = this.itemLevels();
		const { boundary } = this.rules.moment();
		return (entry) => toItem(entry, today, levels, null, boundary);
	}

	private itemLevels(): ItemLevels {
		const settings = this.settings.get();
		return itemLevels(this.levels(settings), usableLabels(settings.labels));
	}

	private today(): LocalDate {
		return this.rules.today();
	}

	/** The timeline's rules by the clock and the day's boundary now. */
	private timeline(): TimelineSpans {
		return new TimelineSpans(this.rules.moment().boundary, this.clock.now());
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

/** A task on the timeline as its rules read it; one without a slot has no place there. */
function slotted(item: TaskItem): SlottedTask {
	if (!item.slot) throw new Error("Task Calendar: the task has no slot on the timeline");
	return { slot: item.slot, open: item.open };
}

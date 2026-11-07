import type { TaskScreen } from "../domain/Days";
import type { LocalDate, ReminderKind, SectionKey, Slot, TaskStatus } from "../domain/Task";
import type { TaskDocument } from "../domain/TaskDocument";
import type { LabelLevel, PriorityLevel } from "../settings";
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
	type DropOrigin,
	type FullTree,
	type DropTo,
	type EndList,
	type GroupedList,
	type GroupName,
	type GroupPlace,
	type ListSection,
	type ProjectRef,
	type ProjectZone,
	type NewTaskPlace,
	type Placement,
	type RepeatRule,
	type ScreenView,
	type SectionPlace,
	type TaskDraft,
	type TaskItem,
	type TaskKey,
	type TaskMenuModel,
	type MenuFrom,
	type MenuScreen,
	type MenuStatusId,
	type PickedTask,
	type TaskService,
	type TaskStep,
} from "./contracts";
import type { SectionOffer } from "./sections";
import { type Clock, type GroupingStore, memoryGrouping, NO_PROJECTS, type Projects, type SettingsStore, type TaskFileStore } from "./ports";
import { revealedGrouping, withFoldToggled, withGrouping } from "./projects";
import { readsAnew } from "./readingSettings";
import { type Moment, type Operation, TaskRules, type TextChange } from "./TaskRules";
import { type Read, type Snapshot, TaskReads } from "./TaskReads";
import { type DocChange, TaskWrites, type Write } from "./TaskWrites";
import type { UndoHistory } from "./UndoHistory";
import type { ResizeEdge, StretchSpan } from "./TimelineSpans";
import { snapMinute } from "./snapGrid";

/** The file's text read last, normalized: `changed` when normalizing it changes what the file says. */
interface Normalized {
	readonly text: string;
	readonly today: LocalDate;
	/** What of the settings the document is read and normalized by: another divider or zoom keeps it. */
	readonly reading: string;
	readonly doc: TaskDocument;
	readonly changed: boolean;
}

/**
 * The task service over a file store: it reads the file into a snapshot and asks TaskReads, runs TaskWrites' operations
 * as one write each, keeps the last reading, tells its listeners of changes and records each action's step for undo.
 * Every rule is in TaskReads, TaskWrites and TaskRules; the phone's door asks the same ones over the text it is handed.
 */
export class TaskServiceImpl implements TaskService {
	private readonly listeners = new Set<() => void>();
	private unsubscribeStore: (() => void) | null = null;
	private unsubscribeSettings: (() => void) | null = null;
	private unsubscribeProjects: (() => void) | null = null;
	private normalized: Normalized | null = null;
	private readonly rules: TaskRules;
	private readonly reads: TaskReads;
	private readonly writes: TaskWrites;

	constructor(
		private readonly store: TaskFileStore,
		private readonly settings: SettingsStore,
		clock: Clock,
		private readonly history: UndoHistory | null = null,
		private readonly projects: Projects = NO_PROJECTS,
		private readonly grouping: GroupingStore = memoryGrouping(),
	) {
		this.rules = new TaskRules(settings, clock);
		this.reads = new TaskReads(this.rules, settings, clock, { notes: () => projects.list(), grouping: () => grouping.get() });
		this.writes = new TaskWrites(this.rules, this.reads);
	}

	priorityLevels(): readonly PriorityLevel[] {
		return this.reads.priorityLevels();
	}

	labelLevels(): readonly LabelLevel[] {
		return this.reads.labelLevels();
	}

	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null } {
		return this.reads.parseTitle(text);
	}

	draftMarks(text: string, priority: string | null, labels: readonly string[]): DraftMarks {
		return this.reads.draftMarks(text, priority, labels);
	}

	isBlank(text: string): boolean {
		return this.reads.isBlank(text);
	}

	withPriority(text: string, prefix: string | null): string {
		return this.reads.withPriority(text, prefix);
	}

	screen(date: LocalDate, project?: string): Promise<ScreenView> {
		return this.ask(this.reads.screenRead(date, project));
	}

	setProject(keys: readonly TaskKey[], project: string | null): Promise<void> {
		return this.run(this.writes.setProject(keys, project));
	}

	projectNotes(): readonly ProjectRef[] {
		return this.reads.projectNotes();
	}

	async setGrouping(list: GroupedList, on: boolean): Promise<void> {
		this.keepGrouping(withGrouping(this.grouping.get(), list, on));
	}

	async toggleFold(list: GroupedList, key: string): Promise<void> {
		this.keepGrouping(withFoldToggled(this.grouping.get(), list, key));
	}

	/** The device's grouping changed: the screens draw their lists again. */
	private keepGrouping(state: ReturnType<GroupingStore["get"]>): void {
		if (state === this.grouping.get()) return;
		this.grouping.set(state);
		this.emit();
	}

	async dayView(date: LocalDate): Promise<DayView> {
		return this.reads.dayView(await this.snapshot(), date);
	}

	async soonWithoutDateView(): Promise<readonly TaskItem[]> {
		return this.reads.soonWithoutDateView(await this.snapshot());
	}

	async inboxView(): Promise<readonly TaskItem[]> {
		return this.reads.inboxView(await this.snapshot());
	}

	async backlogView(): Promise<readonly TaskItem[]> {
		return this.reads.backlogView(await this.snapshot());
	}

	async sectionOffer(date: LocalDate): Promise<SectionOffer> {
		return this.reads.sectionOffer(await this.snapshot(), date);
	}

	async listSections(): Promise<Readonly<Record<GroupedList, readonly ListSection[]>>> {
		return this.reads.listSections(await this.snapshot());
	}

	async doneView(): Promise<readonly TaskItem[]> {
		return this.reads.doneView(await this.snapshot());
	}

	search(query: string): Promise<readonly SearchGroup[]> {
		return this.ask(this.reads.searchRead(query));
	}

	async screenOf(item: TaskItem): Promise<TaskScreen> {
		return this.reads.screenOf(await this.snapshot(), item);
	}

	async reveal(item: TaskItem): Promise<TaskScreen> {
		await this.run(this.writes.revealUnfold(item));
		this.keepGrouping(revealedGrouping(this.grouping.get(), item));
		return this.screenOf(item);
	}

	findIn(items: readonly TaskItem[], key: TaskKey): TaskItem | null {
		return this.reads.findIn(items, key);
	}

	createInList(date: LocalDate, text: string): Promise<void> {
		return this.run(this.writes.createInList(date, text));
	}

	createInSoon(text: string): Promise<void> {
		return this.run(this.writes.createInSoon(text));
	}

	createAtTime(date: LocalDate, start: number, text: string): Promise<void> {
		return this.run(this.writes.createAtTime(date, start, text));
	}

	createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels: readonly string[] = []): Promise<TaskKey | null> {
		return this.run(this.writes.createInPlace(text, priority, place, repeat, labels));
	}

	create(draft: TaskDraft, slot?: Slot): Promise<void> {
		return this.run(this.writes.create(draft, slot));
	}

	createSubtask(parent: TaskKey, draft: TaskDraft): Promise<void> {
		return this.run(this.writes.createSubtask(parent, draft));
	}

	edit(key: TaskKey, draft: TaskDraft): Promise<TaskItem | null> {
		return this.run(this.writes.edit(key, draft));
	}

	placementOf(item: TaskItem): Placement {
		return this.reads.placementOf(item);
	}

	dayColumn(date: LocalDate): DayColumn {
		return this.reads.dayColumn(date);
	}

	columnSections(column: DropColumn, date: LocalDate): ColumnSections | null {
		return this.reads.columnSections(column, date);
	}

	placementOfDay(date: LocalDate): Placement {
		return this.reads.placementOfDay(date);
	}

	listName(list: SectionKey): string {
		return this.reads.listName(list);
	}

	dayOfPlacement(placement: Placement): LocalDate | null {
		return this.reads.dayOfPlacement(placement);
	}

	setStatus(key: TaskKey, status: TaskStatus): Promise<void> {
		return this.run(this.writes.setStatus(key, status));
	}

	setDueDate(key: TaskKey, date: LocalDate | null): Promise<void> {
		return this.run(this.writes.setDueDate(key, date));
	}

	setPriority(key: TaskKey, priority: string | null): Promise<void> {
		return this.run(this.writes.setPriority(key, priority));
	}

	setLabels(key: TaskKey, labels: readonly string[]): Promise<TaskItem | null> {
		return this.run(this.writes.setLabels(key, labels));
	}

	setLabelsAll(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): Promise<readonly (TaskItem | null)[]> {
		return this.run(this.writes.setLabelsAll(steps));
	}

	async togglePriority(keys: readonly TaskKey[], prefix: string): Promise<void> {
		return this.run(await this.ask(this.writes.togglePriority(keys, prefix)));
	}

	async toggleLabel(keys: readonly TaskKey[], name: string): Promise<readonly (TaskItem | null)[]> {
		return this.run(await this.ask(this.writes.toggleLabel(keys, name)));
	}

	async removeDue(keys: readonly TaskKey[]): Promise<void> {
		return this.run(this.writes.removeDue(await this.snapshot(), keys));
	}

	menu(item: TaskItem, from: MenuFrom, screen: MenuScreen): TaskMenuModel {
		return this.reads.menu(item, from, screen);
	}

	bulkMenu(picked: readonly PickedTask[], screen: MenuScreen): TaskMenuModel {
		return this.reads.bulkMenu(picked, screen);
	}

	pickStatus(keys: readonly TaskKey[], id: MenuStatusId): Promise<void> {
		return this.run(this.writes.pickStatus(keys, id));
	}

	async postponeAll(keys: readonly TaskKey[], date: LocalDate): Promise<void> {
		return this.run(this.writes.postponeAll(await this.snapshot(), keys, date));
	}

	removeAll(keys: readonly TaskKey[]): Promise<void> {
		return this.run(this.writes.removeAll(keys));
	}

	carried(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[] {
		return this.reads.carried(lifted, picked);
	}

	setReminder(key: TaskKey, reminder: ReminderKind): Promise<void> {
		return this.run(this.writes.setReminder(key, reminder));
	}

	setCollapsed(key: TaskKey, collapsed: boolean): Promise<void> {
		return this.run(this.writes.setCollapsed(key, collapsed));
	}

	toggleCollapsed(key: TaskKey): Promise<void> {
		return this.run(this.writes.toggleCollapsed(key));
	}

	unfoldAbove(key: TaskKey): Promise<void> {
		return this.run(this.writes.unfoldAbove(key));
	}

	setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void> {
		return this.run(this.writes.setRepeat(key, rule));
	}

	stop(key: TaskKey): Promise<void> {
		return this.run(this.writes.stop(key));
	}

	toggleDone(key: TaskKey): Promise<void> {
		return this.run(this.writes.toggleDone(key));
	}

	async rename(key: TaskKey, text: string): Promise<TaskItem | null> {
		return this.run(this.writes.rename(await this.snapshot(), key, text));
	}

	fullTree(item: TaskItem): FullTree {
		return this.reads.fullTree(item);
	}

	setDescription(key: TaskKey, markdown: string): Promise<void> {
		return this.run(this.writes.setDescription(key, markdown));
	}

	remove(key: TaskKey): Promise<void> {
		return this.run(this.writes.remove(key));
	}

	async find(key: TaskKey, text: string): Promise<TaskItem | null> {
		return this.reads.find(await this.snapshot(), key, text);
	}

	lineOf(key: TaskKey): Promise<number> {
		return this.ask(this.reads.lineOfRead(key));
	}

	moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void> {
		return this.run(this.writes.moveBefore(key, before, date));
	}

	nest(key: TaskKey, parent: TaskKey, before: TaskKey | null): Promise<void> {
		return this.run(this.writes.nest(key, parent, before));
	}

	setSlot(key: TaskKey, slot: Slot): Promise<void> {
		return this.run(this.writes.setSlot(key, slot));
	}

	shownSpan(item: TaskItem, day: LocalDate): DaySpan {
		return this.reads.shownSpan(item, day);
	}

	dropSpan(item: TaskItem | null, from: DropOrigin, start: number): DaySpan {
		return this.reads.dropSpan(item, from, start);
	}

	snap(minute: number, hourPx: number, tolerancePx: number): number {
		return snapMinute(minute, hourPx, tolerancePx);
	}

	newSlot(day: LocalDate, start: number): Slot {
		return this.reads.newSlot(day, start);
	}

	stretch(item: TaskItem, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan {
		return this.reads.stretch(item, day, edge, minute);
	}

	async resize(key: TaskKey, day: LocalDate, edge: ResizeEdge, minute: number, minDurationMin: number): Promise<boolean> {
		return this.run(this.writes.resize(await this.snapshot(), key, day, edge, minute, minDurationMin));
	}

	clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void> {
		return this.run(this.writes.clearSlot(key, place));
	}

	moveToList(key: TaskKey, date: LocalDate): Promise<void> {
		return this.run(this.writes.moveToList(key, date));
	}

	moveToSoon(key: TaskKey, date: LocalDate): Promise<void> {
		return this.run(this.writes.moveToSoon(key, date));
	}

	postpone(key: TaskKey, date: LocalDate): Promise<void> {
		return this.run(this.writes.postpone(key, date));
	}

	moveToEnd(key: TaskKey, section: EndList): Promise<void> {
		return this.run(this.writes.moveToEnd(key, section));
	}

	moveToGroup(key: TaskKey, list: GroupedList, group: GroupName, before: TaskKey | null, date?: LocalDate): Promise<void> {
		return this.run(this.writes.moveToGroup(key, list, group, before, date));
	}

	createGroup(key: TaskKey, list: GroupedList, name: string, date?: LocalDate): Promise<void> {
		return this.run(this.writes.createGroup(key, list, name, date));
	}

	async toSection(keys: readonly TaskKey[], name: GroupName): Promise<void> {
		return this.run(this.writes.toSection(await this.snapshot(), keys, name));
	}

	moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Promise<void> {
		return this.run(this.writes.moveGroup(list, group, place));
	}

	async renameGroup(list: GroupedList, group: string, name: string, project?: ProjectZone): Promise<boolean> {
		return this.run(await this.ask(this.writes.renameGroup(list, group, name, project)));
	}

	removeGroup(list: GroupedList, group: string, project?: ProjectZone): Promise<void> {
		return this.run(this.writes.removeGroup(list, group, project));
	}

	createSection(name: string, place: SectionPlace): Promise<{ readonly list: GroupedList; readonly group: string } | null> {
		return this.run(this.writes.createSection(name, place));
	}

	applyAll(steps: readonly TaskStep[]): Promise<void> {
		return this.run(this.writes.applyAll(steps));
	}

	async drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<readonly TaskKey[]> {
		return this.run(await this.ask(this.writes.drop(tasks, to, day)));
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
		this.unsubscribeProjects ??= this.projects.onChange(() => this.emit());
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.unsubscribeStore?.();
				this.unsubscribeStore = null;
				this.unsubscribeSettings?.();
				this.unsubscribeSettings = null;
				this.unsubscribeProjects?.();
				this.unsubscribeProjects = null;
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

	/** A read as it asks: the file tidied first, read, or missing. */
	private async ask<R>(read: Read<R>): Promise<R> {
		if (read.tidies) await this.normalize();
		if (!read.reads) return read.answer(null);
		const s = await this.snapshotOrNull();
		if (s) return read.answer(s);
		if (read.missing) return read.missing();
		throw new TasksFileMissingError(this.settings.get().tasksFile);
	}

	/** A write as one action: its operation written once, then its answer over the document before and after. */
	private async run<R>(write: Write<R>): Promise<R> {
		return write.answer(await this.mutate(write.operation));
	}

	/**
	 * One action's change of the file; it is a step to take back unless `record` is false (the file tidied, not changed by an
	 * action). Gives the document as normalized before and after the write; null when it changed nothing.
	 */
	private async mutate(operation: Operation | null, record = true): Promise<DocChange | null> {
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

	private async snapshot(): Promise<Snapshot> {
		const s = await this.snapshotOrNull();
		if (!s) throw new TasksFileMissingError(this.settings.get().tasksFile);
		return s;
	}

	private async snapshotOrNull(): Promise<Snapshot | null> {
		const at = this.rules.moment();
		const text = await this.store.read();
		if (text === null) return null;
		return { text, doc: this.normalizedOf(text, at).doc, today: at.today, boundary: at.boundary };
	}

	/** The text parsed and normalized, kept until the text, the day or the settings it is read by change. */
	private normalizedOf(text: string, at: Moment): Normalized {
		const last = this.normalized;
		if (last && last.text === text && last.today === at.today && last.reading === at.reading) return last;
		const { doc, changed } = this.rules.read(text, at);
		this.normalized = { text, today: at.today, reading: at.reading, doc, changed };
		return this.normalized;
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

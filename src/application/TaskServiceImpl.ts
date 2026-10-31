import { DayBoundary } from "../domain/DayBoundary";
import { normalize } from "../domain/normalize";
import * as ops from "../domain/operations";
import { dayList, inboxList, slottedOn, soonWithoutDate, toItem } from "../domain/queries";
import type { LocalDate, Slot, TaskStatus } from "../domain/Task";
import { TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { type PriorityLevel, type TaskCalendarSettings, usableLevels } from "../settings";
import {
	StaleTaskError,
	TasksFileMissingError,
	type DayView,
	type GroupedList,
	type GroupName,
	type GroupPlace,
	type Placement,
	type TaskDraft,
	type TaskItem,
	type TaskKey,
	type TaskService,
} from "./contracts";
import type { Clock, SettingsStore, TaskFileStore } from "./ports";

type Operation = (doc: TaskDocument, today: LocalDate, settings: TaskCalendarSettings, boundary: DayBoundary) => TaskDocument;

function allSectionNames(settings: TaskCalendarSettings): readonly string[] {
	const s = settings.sections;
	return [s.inbox, s.now, s.soon, s.backlog, s.done];
}

function managedSectionNames(settings: TaskCalendarSettings): readonly string[] {
	const s = settings.sections;
	return [s.inbox, s.now, s.soon, s.done];
}

export class TaskServiceImpl implements TaskService {
	private readonly listeners = new Set<() => void>();
	private unsubscribeStore: (() => void) | null = null;

	constructor(
		private readonly store: TaskFileStore,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
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

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today) => ops.placeTask(doc, null, draft, today, slot));
	}

	async createSubtask(parent: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today) => ops.createSubtask(doc, this.entryOf(doc, parent), draft, today));
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today) => ops.placeTask(doc, this.entryOf(doc, key), draft, today));
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate === this.boundary(this.settings.get()).dayOf(this.clock.now())) return { kind: "now" };
		if (item.dueDate !== null) return { kind: "date", date: item.dueDate };
		if (item.key.section === "inbox") return { kind: "inbox" };
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

	async rename(key: TaskKey, text: string): Promise<void> {
		if (this.blank(text)) return;
		await this.mutate((doc) => ops.rename(doc, this.entryOf(doc, key), text));
	}

	async remove(key: TaskKey): Promise<void> {
		await this.mutate((doc) => ops.remove(doc, this.entryOf(doc, key)));
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

	async moveToEnd(key: TaskKey, section: "inbox" | "soon"): Promise<void> {
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

	async normalize(): Promise<void> {
		const text = await this.store.read();
		if (text === null) return;
		const settings = this.settings.get();
		const doc = this.parse(text, settings);
		const boundary = this.boundary(settings);
		if (normalize(doc, boundary.dayOf(this.clock.now()), boundary, ops.usablePresets(settings.groups.presets)) === doc) return;
		await this.mutate((d) => d);
	}

	async createFile(): Promise<void> {
		await this.store.create(TaskDocument.empty(allSectionNames(this.settings.get())));
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

	private async mutate(operation: Operation): Promise<void> {
		const settings = this.settings.get();
		const boundary = this.boundary(settings);
		const today = boundary.dayOf(this.clock.now());
		let failure: unknown = null;
		await this.store.write((text) => {
			try {
				const presets = ops.usablePresets(settings.groups.presets);
				const doc = normalize(this.parse(text, settings).ensureSections(managedSectionNames(settings)), today, boundary, presets);
				return normalize(operation(doc, today, settings, boundary), today, boundary, presets).serialize();
			} catch (e) {
				failure = e;
				return text;
			}
		});
		if (failure !== null) throw failure;
	}

	private async readNormalized(): Promise<{ doc: TaskDocument; today: LocalDate; boundary: DayBoundary }> {
		const settings = this.settings.get();
		const text = await this.store.read();
		if (text === null) throw new TasksFileMissingError(settings.tasksFile);
		const boundary = this.boundary(settings);
		const today = boundary.dayOf(this.clock.now());
		return { doc: normalize(this.parse(text, settings).ensureSections(managedSectionNames(settings)), today, boundary, ops.usablePresets(settings.groups.presets)), today, boundary };
	}

	private parse(text: string, settings: TaskCalendarSettings): TaskDocument {
		const s = settings.sections;
		return TaskDocument.parse(
			text,
			{ inbox: s.inbox, now: s.now, soon: s.soon, done: s.done, ungrouped: settings.groups.ungrouped },
			{ dueDate: settings.dueDateMarker, slot: settings.slotMarker, priorities: this.levels(settings).map((l) => l.prefix) },
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

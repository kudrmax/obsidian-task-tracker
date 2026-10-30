import { DayBoundary } from "../domain/DayBoundary";
import { normalize } from "../domain/normalize";
import * as ops from "../domain/operations";
import { listOn, slottedOn, soonList, toItem } from "../domain/queries";
import type { LocalDate, Slot, TaskStatus } from "../domain/Task";
import { TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import type { TaskCalendarSettings } from "../settings";
import {
	StaleTaskError,
	TasksFileMissingError,
	type DayView,
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
	return [s.now, s.soon, s.done];
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
		return { date, list: listOn(doc, date, today, boundary).map(toItem), slotted: slottedOn(doc, date, boundary).map(toItem) };
	}

	async soonView(): Promise<readonly TaskItem[]> {
		const { doc } = await this.readNormalized();
		return soonList(doc).map(toItem);
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
		await this.mutate((doc, today, settings, boundary) => ops.createAtTime(doc, date, today, start, settings.newTaskMinutes, text, boundary));
	}

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today) => ops.placeTask(doc, null, draft, today, slot));
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<void> {
		if (this.blank(draft.text)) return;
		await this.mutate((doc, today) => ops.placeTask(doc, this.entryOf(doc, key), draft, today));
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate !== null) return { kind: "date", date: item.dueDate };
		return item.key.section === "soon" ? { kind: "soon" } : { kind: "now" };
	}

	async setStatus(key: TaskKey, status: TaskStatus): Promise<void> {
		await this.mutate((doc) => ops.setStatus(doc, this.entryOf(doc, key), status));
	}

	async setDueDate(key: TaskKey, date: LocalDate | null): Promise<void> {
		await this.mutate((doc) => ops.setDueDate(doc, this.entryOf(doc, key), date));
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

	async setSlot(key: TaskKey, slot: Slot): Promise<void> {
		await this.mutate((doc, today, _settings, boundary) => ops.setSlot(doc, this.entryOf(doc, key), slot, today, boundary));
	}

	async clearSlot(key: TaskKey): Promise<void> {
		await this.mutate((doc) => ops.clearSlot(doc, this.entryOf(doc, key)));
	}

	async moveToList(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate((doc, today) => ops.moveToList(doc, this.entryOf(doc, key), date, today));
	}

	async moveToSoon(key: TaskKey, date: LocalDate): Promise<void> {
		await this.mutate((doc, today) => ops.moveToSoon(doc, this.entryOf(doc, key), date, today));
	}

	async normalize(): Promise<void> {
		const text = await this.store.read();
		if (text === null) return;
		const settings = this.settings.get();
		const doc = this.parse(text, settings);
		const boundary = this.boundary(settings);
		if (normalize(doc, boundary.dayOf(this.clock.now()), boundary) === doc) return;
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
				const doc = normalize(this.parse(text, settings).ensureSections(managedSectionNames(settings)), today, boundary);
				return normalize(operation(doc, today, settings, boundary), today, boundary).serialize();
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
		return { doc: normalize(this.parse(text, settings).ensureSections(managedSectionNames(settings)), today, boundary), today, boundary };
	}

	private parse(text: string, settings: TaskCalendarSettings): TaskDocument {
		const s = settings.sections;
		return TaskDocument.parse(text, { now: s.now, soon: s.soon, done: s.done }, { dueDate: settings.dueDateMarker, slot: settings.slotMarker });
	}

	private entryOf(doc: TaskDocument, key: TaskKey): TaskEntry {
		const entry = doc.tasks(key.section)[key.index];
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

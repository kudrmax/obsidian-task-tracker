import { type CalendarService, type Clock, type DayEvents, type DayService, type DropColumn, type DroppedTask, type DropTo, type LocalDate, listCardMenuFrom, type MenuFrom as CoreMenuFrom, originOf, type ScreenReader, type TaskItem, type TaskService } from "../../core/application/contracts";
import type { Destination, Edge, EntryBar, EntryCommit, EntryDraft, EntryField, ListId, MenuAction, MenuFrom, MenuModel, Now, PlaceId, RenameStart, ScreenData, ScreenPort } from "../ui/engine/port";
import { CoreEntry } from "./CoreEntry";
import { ListCards } from "./ListCards";
import { menuModelOf } from "./menuModel";
import { ScreenDrawing } from "./ScreenDrawing";

/** The core's services `CorePort` forwards to, as `composeCore` gives them. */
export interface CorePortServices {
	readonly tasks: TaskService;
	readonly days: DayService;
	readonly calendars: CalendarService;
	readonly clock: Clock;
}

/** A drop as the core takes it: the task and where it was dragged from, where it is let go, and the day the screen shows. */
interface CoreDrop {
	readonly tasks: readonly DroppedTask[];
	readonly to: DropTo;
	readonly day: LocalDate;
}

const COLUMNS: Readonly<Record<ListId, DropColumn>> = { inbox: "inbox", soon: "soon", day: "day" };

/**
 * The engine's port over the core (spec 2026-11-18, Part 2.3; the audit, «What the core serves the port»): every read is
 * the core's held read (`TaskService.reader`), taken anew when the core says the tasks changed; every write a call of the
 * core's services; every rule the core's. It decides nothing: it turns the engine's words (a list, a card it goes before,
 * a depth, a minute) into the core's (a column, a gap, a key, a slot) and back.
 */
export class CorePort implements ScreenPort {
	private readonly listeners = new Set<() => void>();
	private readonly cache = new Map<string, ScreenData>();
	private readonly events = new Map<LocalDate, DayEvents>();
	private readonly asked = new Set<LocalDate>();
	private readonly drawing: ScreenDrawing;
	private readonly entry: CoreEntry;
	private readonly offs: (() => void)[];
	/** The next held read asked for and not begun yet: every ask before it begins shares it. */
	private queued: Promise<void> | null = null;
	private reads: Promise<void> = Promise.resolve();

	private constructor(
		private readonly core: CorePortServices,
		private reader: ScreenReader,
	) {
		this.drawing = new ScreenDrawing(core.tasks, core.days, core.calendars);
		this.entry = new CoreEntry(core, this.drawing, () => this.reader, () => this.refresh());
		this.offs = [core.tasks.onChange(() => void this.refresh()), core.days.onDayChange(() => void this.refresh()), core.calendars.onChange(() => this.forgetEvents())];
	}

	/** The port over `core`, once the file is read. */
	static async open(core: CorePortServices): Promise<CorePort> {
		return new CorePort(core, await core.tasks.reader(null));
	}

	/** Lets go of the core's subscriptions: the screen is gone. */
	dispose(): void {
		for (const off of this.offs) off();
		this.listeners.clear();
	}

	read(dayOffset: number): ScreenData {
		const key = `${dayOffset}@${this.now().minute}`;
		let data = this.cache.get(key);
		if (!data) {
			if (this.cache.size > 16) this.cache.clear();
			const date = this.dateOf(dayOffset);
			const screen = this.reader.screen(date);
			data = this.drawing.draw({ date, screen, lists: this.listsOf(date), events: this.eventsOf(date) });
			this.cache.set(key, data);
		}
		return data;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	now(): Now {
		const minute = this.core.days.boundary().offsetOf(this.core.days.today(), this.core.clock.now());
		return { minute, label: this.core.days.clockAt(minute) };
	}

	preview(id: string, to: Destination): ScreenData {
		const drop = this.dropOf(id, to);
		const date = this.dateOf(to.dayOffset);
		if (!drop) return this.read(to.dayOffset);
		const { screen } = this.reader.dropPreview(drop.tasks, drop.to, drop.day);
		return this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date) });
	}

	takes(id: string, to: Destination): boolean {
		const drop = this.dropOf(id, to);
		return drop !== null && this.reader.takes(drop.tasks.map((task) => task.from), drop.to);
	}

	stretched(id: string, dayOffset: number, edge: Edge, minute: number): ScreenData {
		const date = this.dateOf(dayOffset);
		const span = this.reader.stretch(id, date, edge, minute);
		const screen = this.reader.screen(date);
		return this.drawing.draw({ date, screen, lists: this.listsOf(date), events: this.eventsOf(date), ...(span && { held: { id, start: span.start, end: span.end > span.start ? span.end : null } }) });
	}

	resized(id: string, dayOffset: number, edge: Edge, minute: number, least: number): Destination | null {
		const date = this.dateOf(dayOffset);
		const slot = this.reader.resizedSlot(id, date, edge, minute, least);
		if (!slot) return null;
		const span = this.core.days.boundary().spanOf(slot, date);
		return { list: "day", before: null, dayOffset, at: span.start, end: span.end };
	}

	async move(id: string, to: Destination): Promise<void> {
		const item = this.reader.item(id);
		if (!item) return;
		const day = this.dateOf(to.dayOffset);
		if (to.at !== undefined && to.end !== undefined) await this.core.tasks.setSlot(item.key, this.core.days.boundary().slotAt(day, to.at, to.end));
		else {
			const drop = this.dropOf(id, to);
			if (!drop) return;
			await this.core.tasks.drop(drop.tasks, drop.to, drop.day);
		}
		await this.refresh();
	}

	clockAt(minute: number): string {
		return this.core.days.clockAt(minute);
	}

	newTaskPlace(dayOffset: number, shown: readonly ListId[]): Destination {
		return this.entry.plus(dayOffset, shown);
	}

	listEnd(list: ListId, dayOffset: number): Destination {
		return this.entry.end(list, dayOffset);
	}

	subtaskPlace(id: string, dayOffset: number): Destination {
		return this.entry.subtask(id, dayOffset);
	}

	entryBar(field: EntryField, draft: EntryDraft, text: string): EntryBar {
		return this.entry.bar(field, draft, text);
	}

	entryPlace(field: EntryField, choice: PlaceId, date: string | null, reach: readonly ListId[]): EntryField {
		return this.entry.place(field, choice, date, reach);
	}

	entryDescription(field: EntryField): string {
		return field.renaming === null ? "" : (this.reader.item(field.renaming)?.description ?? "");
	}

	rename(id: string, from: MenuFrom, dayOffset: number): RenameStart {
		return this.entry.rename(id, from, dayOffset);
	}

	commit(field: EntryField, text: string, draft: EntryDraft, next: boolean): EntryCommit {
		return this.entry.commit(field, text, draft, next);
	}

	menu(id: string, from: MenuFrom): MenuModel {
		const event = this.eventNamed(id);
		if (event) return { kind: "event", title: event.title };
		const item = this.itemOf(id);
		const day = item.day ?? this.core.days.today();
		const model = this.reader.menu(id, this.coreFrom(item, from), day);
		if (!model) throw new Error(`no task ${id}`);
		return menuModelOf(item, model, from === "calendar" ? item.subtasks.map((sub) => sub.id) : [], (list) => this.core.tasks.listName(list), this.core.days.today());
	}

	async act(id: string, action: MenuAction, from: MenuFrom = "list"): Promise<void> {
		if (action.kind === "row") return;
		const item = this.reader.item(id);
		if (!item) return;
		const tasks = this.core.tasks;
		const keys = [item.key];
		switch (action.kind) {
			case "status": {
				const model = this.reader.menu(id, this.coreFrom(item, from), item.day ?? this.core.days.today());
				await tasks.pickStatus((model?.statusTasks ?? [item]).map((task) => task.key), action.id);
				break;
			}
			case "priority":
				await tasks.togglePriority(keys, action.prefix);
				break;
			case "label":
				await tasks.toggleLabel(keys, action.name);
				break;
			case "date":
				await (action.date === null ? tasks.removeDue(keys) : tasks.postponeAll(keys, action.date));
				break;
			case "sendTo":
				await tasks.sendTo(keys, { kind: action.list });
				break;
			case "reminder":
				await tasks.setReminder(item.key, action.reminder);
				break;
			case "delete":
				await tasks.remove(item.key);
		}
		await this.refresh();
	}

	/** The day `dayOffset` days from today, as the core steps days. */
	private dateOf(dayOffset: number): LocalDate {
		return this.core.days.step(this.core.days.today(), dayOffset);
	}

	private listsOf(date: LocalDate) {
		return { inbox: this.reader.columnView("inbox", date), soon: this.reader.columnView("soon", date), day: this.reader.columnView("day", date) };
	}

	private itemOf(id: string): TaskItem {
		const item = this.reader.item(id);
		if (!item) throw new Error(`no task ${id}`);
		return item;
	}

	private coreFrom(item: TaskItem, from: MenuFrom): CoreMenuFrom {
		return from === "calendar" ? "timeline" : from === "stack" ? "stack" : listCardMenuFrom(item);
	}

	/** What the core takes for the task `id` let go at `to`: a minute of a day's calendar, or a list's gap; null for a task it can't carry. */
	private dropOf(id: string, to: Destination): CoreDrop | null {
		const item = this.reader.item(id);
		const from = item && originOf(item);
		if (!item || !from) return null;
		const day = this.dateOf(to.dayOffset);
		const tasks = [{ key: item.key, from }];
		if (to.at !== undefined) return { tasks, to: { kind: "time", start: to.at }, day };
		const column = COLUMNS[to.list];
		const place = this.core.tasks.opensGaps([from], column, day) ? new ListCards(this.reader.columnView(column, day), id).placeOf(to) : null;
		return { tasks, to: { kind: "place", column, place }, day };
	}

	private eventsOf(date: LocalDate): DayEvents | null {
		const kept = this.events.get(date);
		if (kept || this.asked.has(date)) return kept ?? null;
		this.asked.add(date);
		const ask = this.core.calendars.events(date, "open");
		if (ask.cached) this.events.set(date, ask.cached);
		void ask.fresh?.().then((fresh) => {
			this.events.set(date, fresh);
			this.changed();
		});
		return ask.cached;
	}

	private eventNamed(id: string) {
		for (const day of this.events.values()) {
			const found = day.events.find((event) => event.id === id);
			if (found) return found;
		}
		return null;
	}

	private forgetEvents(): void {
		this.events.clear();
		this.asked.clear();
		this.changed();
	}

	/** A held read of the file begun after this ask, the screen told once it is in; asks before it begins share it. */
	private refresh(): Promise<void> {
		if (this.queued) return this.queued;
		const run = this.reads.then(async () => {
			this.queued = null;
			this.reader = await this.core.tasks.reader(null);
			this.changed();
		});
		this.queued = run;
		this.reads = run.catch(() => undefined);
		return run;
	}

	private changed(): void {
		this.cache.clear();
		for (const listener of this.listeners) listener();
	}
}

import { levelRange, sameSlot, type CalendarService, dividerAt, type DividerStop, LIST_WIDTHS, listShareOf, type ListWidths, listWidths, type Clock, type DayEvents, type DayService, type DropColumn, type DroppedTask, type DropTo, type LocalDate, listCardMenuFrom, type MenuFrom as CoreMenuFrom, originOf, type ScreenReader, type ShownChange, type TaskItem, type TaskService, type UndoOutcome, undoNotice, projectNodeOf, type ProjectsNodeId, type UndoService } from "../../core/application/contracts";
import type { ScreenContext, Destination, Edge, EntryBar, EntryCommit, EntryDraft, EntryField, LevelRange, ListId, MenuAction, MenuFrom, MenuModel, Now, PlaceId, RenameStart, ScreenData, ScreenPort } from "../ui/engine/port";
import { CoreEntry } from "./CoreEntry";
import { WriteQueue } from "./WriteQueue";
import { ListCards } from "./ListCards";
import { menuModelOf } from "./menuModel";
import { ScreenDrawing, type ScreenSource } from "./ScreenDrawing";

/** The core's services `CorePort` forwards to, as `composeCore` gives them. */
export interface CorePortServices {
	readonly tasks: TaskService;
	readonly days: DayService;
	readonly calendars: CalendarService;
	readonly undo: UndoService;
	readonly clock: Clock;
	/** A write that failed: the host says so, as the old screen does (a notice). */
	readonly onError: (error: unknown) => void;
	/** Where the tasks file is looked for, as the settings name it: what the screen says when it is missing. */
	readonly tasksFile: () => string;
}

/**
 * A move as the core takes it: a drop (the task and where it was dragged from, where it is let go, the screen's day), a
 * time written as it is (a let-go dot's `at` and `end`), or none at all (let go where it was lifted).
 */
type CoreMove =
	| { readonly kind: "drop"; readonly tasks: readonly DroppedTask[]; readonly to: DropTo; readonly day: LocalDate }
	| { readonly kind: "slot"; readonly key: TaskItem["key"]; readonly slot: NonNullable<TaskItem["slot"]>; readonly day: LocalDate }
	| { readonly kind: "home" };

/** The context of every task: no project chosen. */
const EVERY = "";

const COLUMNS: Readonly<Record<ListId, DropColumn>> = { inbox: "inbox", backlog: "backlog", soon: "soon", day: "day" };

/**
 * What every screen's port over the core shares (Decision 145): the core's held read of the file, taken anew when the
 * core says the tasks changed, its reads within each project, the calendars' events, the one write queue, and the core's
 * subscriptions. Each mounted screen has a port of its own over it (`CorePort.within`), in that screen's context.
 */
class CoreReads {
	readonly drawing: ScreenDrawing;
	readonly queue: WriteQueue;
	private readonly views = new Set<CorePort>();
	private readonly events = new Map<LocalDate, DayEvents>();
	private readonly asked = new Set<LocalDate>();
	private readonly offs: (() => void)[];
	/** The same read within each project a screen is drawn in (`ScreenReader.within`), kept until the next read. */
	private readonly readers = new Map<string, ScreenReader>();
	/** The next held read asked for and not begun yet: every ask before it begins shares it. */
	private queued: Promise<void> | null = null;
	private reads: Promise<void> = Promise.resolve();

	constructor(
		readonly core: CorePortServices,
		/** The core's held read of the file, every task. */
		private base: ScreenReader,
	) {
		this.drawing = new ScreenDrawing(core.tasks, core.days, core.calendars, core.tasksFile);
		this.queue = new WriteQueue(core.onError);
		this.offs = [core.tasks.onChange(() => void this.refresh()), core.tasks.onShownChange((change) => this.settingsChanged(change)), core.days.onDayChange(() => void this.refresh()), core.undo.onChange(() => this.changed()), core.calendars.onChange(() => this.forgetEvents())];
	}

	/** A screen's port in `context`, told of every change from now on. */
	view(context: string): CorePort {
		const view = new CorePort(this, context);
		this.views.add(view);
		return view;
	}

	release(view: CorePort): void {
		this.views.delete(view);
	}

	dispose(): void {
		for (const off of this.offs) off();
		this.views.clear();
	}

	/** The held read within `context`: the same read, another filter, at once. */
	reader(context: string): ScreenReader {
		if (context === EVERY) return this.base;
		let within = this.readers.get(context);
		if (!within) {
			within = this.base.within(projectNodeOf(context));
			this.readers.set(context, within);
		}
		return within;
	}

	/** A held read of the file begun after this ask, every screen told once it is in; asks before it begins share it. */
	refresh(): Promise<void> {
		if (this.queued) return this.queued;
		const run = this.reads.then(async () => {
			this.queued = null;
			this.base = await this.core.tasks.reader(null);
			this.readers.clear();
			this.changed();
		});
		this.queued = run;
		this.reads = run.catch(() => undefined);
		return run;
	}

	eventsOf(date: LocalDate): DayEvents | null {
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

	eventNamed(id: string) {
		for (const day of this.events.values()) {
			const found = day.events.find((event) => event.id === id);
			if (found) return found;
		}
		return null;
	}

	/** A setting the screen shows changed: the tasks are read anew by `onChange`; what is drawn straight from the settings is drawn anew here, the calendars' events fetched anew. */
	private settingsChanged(change: ShownChange): void {
		if (change.calendars) this.forgetEvents();
		if (change.drawn || change.cards || change.timeline || change.gestures) void this.refresh();
	}

	private forgetEvents(): void {
		this.events.clear();
		this.asked.clear();
		this.changed();
	}

	private changed(): void {
		for (const view of this.views) view.changed();
	}
}

/**
 * The engine's port over the core (spec 2026-11-18, Part 2.3; the audit, «What the core serves the port»): every read is
 * the core's held read (`TaskService.reader`), taken anew when the core says the tasks changed; every write a call of the
 * core's services; every rule the core's. It decides nothing: it turns the engine's words (a list, a card it goes before,
 * a depth, a minute) into the core's (a column, a gap, a key, a slot) and back. One port per mounted screen, in that
 * screen's context: what it reads, what a drop or a new task writes, go by its own context, never another screen's.
 */
export class CorePort implements ScreenPort {
	private readonly listeners = new Set<() => void>();
	private readonly cache = new Map<string, ScreenData>();
	private readonly entry: CoreEntry;

	/** @internal Made by `CoreReads.view`. */
	constructor(
		private readonly shared: CoreReads,
		/** The context this screen is drawn in: what its writes and menus go by. */
		private context: string,
	) {
		this.entry = new CoreEntry(shared.core, shared.drawing, () => this.reader, () => this.refresh(), shared.queue, () => this.filter());
	}

	/** The port over `core`, once the file is read, in every task's context. */
	static async open(core: CorePortServices): Promise<CorePort> {
		return new CoreReads(core, await core.tasks.reader(null)).view(EVERY);
	}

	/** Another screen's port over the same read, in `context` (every task when absent). */
	within(context?: ScreenContext): CorePort {
		return this.shared.view(context?.project ?? EVERY);
	}

	/** This screen's port is let go: its screen is gone. */
	release(): void {
		this.listeners.clear();
		this.shared.release(this);
	}

	/** Lets go of the core's subscriptions: every screen is gone (the plugin unloads). */
	dispose(): void {
		this.listeners.clear();
		this.shared.dispose();
	}

	/** @internal The read changed: drawn anew. */
	changed(): void {
		this.cache.clear();
		for (const listener of this.listeners) listener();
	}

	private get core(): CorePortServices {
		return this.shared.core;
	}

	private get drawing(): ScreenDrawing {
		return this.shared.drawing;
	}

	private get reader(): ScreenReader {
		return this.shared.reader(this.context);
	}

	private refresh(): Promise<void> {
		return this.shared.refresh();
	}

	private eventsOf(date: LocalDate): DayEvents | null {
		return this.shared.eventsOf(date);
	}

	read(dayOffset: number, context?: ScreenContext): ScreenData {
		this.use(context);
		const key = `${dayOffset}@${this.now().minute}#${this.context}`;
		let data = this.cache.get(key);
		if (!data) {
			if (this.cache.size > 16) this.cache.clear();
			const date = this.dateOf(dayOffset);
			const screen = this.reader.screen(date);
			data = this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date) });
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

	preview(id: string, to: Destination, context?: ScreenContext): ScreenData {
		this.use(context);
		const move = this.moveOf(id, to);
		const date = this.dateOf(to.dayOffset);
		if (!move || move.kind === "home") return this.read(to.dayOffset);
		if (move.kind === "slot") return this.drawn(date, { id, ...this.core.days.boundary().spanOf(move.slot, date) });
		const { screen } = this.reader.dropPreview(move.tasks, move.to, move.day);
		return this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date) });
	}

	/** Nothing changes where the core leaves the task as it is: a card let go where it was lifted (`placeOfDrop`), a time it has already (`sameSlot`). */
	changes(id: string, to: Destination): boolean {
		const move = this.moveOf(id, to);
		const item = this.reader.item(id);
		if (!move || !item || move.kind === "home") return false;
		if (move.kind === "slot") return !sameSlot(item.slot, move.slot);
		if (move.to.kind !== "time") return true;
		const landed = this.reader.dropPreview(move.tasks, move.to, move.day).landings[0];
		return !(landed?.kind === "timeline" && sameSlot(landed.item.slot, item.slot));
	}

	takes(id: string, to: Destination): boolean {
		const move = this.moveOf(id, to);
		if (!move) return false;
		return move.kind !== "drop" || this.reader.takes(move.tasks.map((task) => task.from), move.to);
	}

	stretched(id: string, dayOffset: number, edge: Edge, minute: number, context?: ScreenContext): ScreenData {
		this.use(context);
		const date = this.dateOf(dayOffset);
		const span = this.reader.stretch(id, date, edge, minute);
		return this.drawn(date, span && { id, start: span.start, end: span.end > span.start ? span.end : null });
	}

	resized(id: string, dayOffset: number, edge: Edge, minute: number, least: number): Destination | null {
		const date = this.dateOf(dayOffset);
		const slot = this.reader.resizedSlot(id, date, edge, minute, least);
		if (!slot) return null;
		const span = this.core.days.boundary().spanOf(slot, date);
		return { list: "day", before: null, dayOffset, at: span.start, end: span.end };
	}

	async move(id: string, to: Destination): Promise<void> {
		const move = this.moveOf(id, to);
		if (!move || move.kind === "home") return;
		if (move.kind === "slot") await this.core.tasks.setSlot(move.key, move.slot);
		else await this.core.tasks.drop(move.tasks, move.to, move.day, this.filter()?.node ?? null);
		await this.refresh();
	}

	readonly listBounds = LIST_WIDTHS;

	listWidths(share: number, viewWidth: number, dividerWidth: number): ListWidths {
		return listWidths(share, viewWidth, dividerWidth);
	}

	listShareOf(width: number, viewWidth: number, dividerWidth: number): number {
		return listShareOf(width, viewWidth, dividerWidth);
	}

	dividerAt(wanted: number, widths: ListWidths, speed: number): DividerStop {
		return dividerAt(wanted, widths, speed);
	}

	blankProjectName(name: string): boolean {
		return this.core.tasks.isBlankProjectName(name);
	}

	async newProject(name: string): Promise<string | null> {
		const made = await this.core.tasks.newProject(name, []);
		await this.refresh();
		return made && !made.folder ? made.name : null;
	}

	canUndo(): boolean {
		return this.core.undo.canUndo();
	}

	canRedo(): boolean {
		return this.core.undo.canRedo();
	}

	async undo(): Promise<UndoOutcome> {
		const outcome = await this.core.undo.undo();
		await this.refresh();
		return outcome;
	}

	async redo(): Promise<UndoOutcome> {
		const outcome = await this.core.undo.redo();
		await this.refresh();
		return outcome;
	}

	undoNotice(step: "undo" | "redo", outcome: UndoOutcome): string | null {
		return undoNotice(step, outcome);
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

	subtaskPlace(id: string, dayOffset: number): EntryField {
		return this.entry.subtask(id, dayOffset);
	}

	entryShift(field: EntryField, draft: EntryDraft, text: string, by: 1 | -1): EntryField | null {
		return this.entry.shift(field, draft, text, by);
	}

	snap(minute: number, hourPx: number, tolerancePx: number): number {
		return this.core.tasks.snap(minute, hourPx, tolerancePx);
	}

	levels(above: number | null, below: number | null): LevelRange {
		const cards = [...(above === null ? [] : [{ level: above, group: null }]), ...(below === null ? [] : [{ level: below, group: null }])];
		return levelRange(cards, above === null ? 0 : 1, null);
	}

	async createFile(): Promise<void> {
		await this.core.tasks.createFile();
		await this.refresh();
	}

	entryDraft(field: EntryField): EntryDraft {
		return this.entry.draft(field);
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

	menu(id: string, from: MenuFrom, dayOffset: number): MenuModel {
		const event = this.shared.eventNamed(id);
		if (event) return { kind: "event", title: event.title };
		const item = this.itemOf(id);
		const model = this.reader.menu(id, this.coreFrom(item, from), this.dateOf(dayOffset));
		if (!model) throw new Error(`no task ${id}`);
		return menuModelOf(item, model, from === "calendar" ? item.subtasks.map((sub) => sub.id) : [], (list) => this.core.tasks.listName(list), this.core.days.today());
	}

	/** The core's ids stay through every write it makes (`TaskItem.id`): the task's own id, null once it is gone. */
	async act(id: string, action: MenuAction, from: MenuFrom, dayOffset: number): Promise<string | null> {
		const item = this.reader.item(id);
		if (action.kind === "row" || !item) return item ? id : null;
		const tasks = this.core.tasks;
		const keys = [item.key];
		switch (action.kind) {
			case "status": {
				const model = this.reader.menu(id, this.coreFrom(item, from), this.dateOf(dayOffset));
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
			case "project":
				await (action.name === null ? tasks.setProject(keys, null) : tasks.toggleProject(keys, action.name));
				break;
			case "newProject":
				await tasks.newProject(action.name, keys);
				break;
			case "delete":
				await tasks.remove(item.key);
		}
		await this.refresh();
		return this.reader.item(id) ? id : null;
	}

	/** The day `dayOffset` days from today, as the core steps days. */
	private dateOf(dayOffset: number): LocalDate {
		return this.core.days.step(this.core.days.today(), dayOffset);
	}

	/** The held read's screen of `date`, a task held by a dot drawn at `held`. */
	private drawn(date: LocalDate, held: ScreenSource["held"] | null): ScreenData {
		const screen = this.reader.screen(date);
		return this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date), ...(held && { held }) });
	}

	private itemOf(id: string): TaskItem {
		const item = this.reader.item(id);
		if (!item) throw new Error(`no task ${id}`);
		return item;
	}

	private coreFrom(item: TaskItem, from: MenuFrom): CoreMenuFrom {
		return from === "calendar" ? "timeline" : from === "stack" ? "stack" : listCardMenuFrom(item);
	}

	/**
	 * What the core takes for the task `id` let go at `to`: a time written as it is (a let-go dot), a minute of a day's
	 * calendar, or a list's gap; none for a task it can't carry or a place that is gone (`ListCards.gapOf`).
	 */
	private moveOf(id: string, to: Destination): CoreMove | null {
		const item = this.reader.item(id);
		const from = item && originOf(item);
		if (!item || !from) return null;
		const day = this.dateOf(to.dayOffset);
		if (to.at !== undefined && to.end !== undefined) return { kind: "slot", key: item.key, slot: this.core.days.boundary().slotAt(day, to.at, to.end), day };
		const tasks = [{ key: item.key, from }];
		if (to.at !== undefined) return { kind: "drop", tasks, to: { kind: "time", start: to.at }, day };
		const column = COLUMNS[to.list];
		if (!this.core.tasks.opensGaps([from], column, day)) return { kind: "drop", tasks, to: { kind: "place", column, place: null }, day };
		const place = new ListCards(this.drawing.column(this.reader.screen(day), column), id).dropOf(to);
		if (place === null) return null;
		return place === "home" ? { kind: "home" } : { kind: "drop", tasks, to: { kind: "place", column, place }, day };
	}

	/** The screen drawn in `context` (every task when absent) from now on. */
	private use(context: ScreenContext | undefined): void {
		this.context = context?.project ?? EVERY;
	}

	/** The project the screen is filtered by, as the quick entry and a drop take it; null for every task. */
	private filter(): { readonly node: ProjectsNodeId; readonly project: string | null } | null {
		return this.context === EVERY ? null : { node: projectNodeOf(this.context), project: this.context };
	}
}

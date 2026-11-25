import { type ColumnList, groupPlaceOf, SectionNameEntry, levelRange, sameSlot, type CalendarPoll, type CalendarService, dividerAt, type DividerStop, LIST_WIDTHS, listShareOf, type ListWidths, listWidths, type Clock, type DayEvents, type DayChange, type DayService, type DropColumn, type DroppedTask, type DropTo, type LocalDate, listCardMenuFrom, type MenuFrom as CoreMenuFrom, originOf, type ScreenReader, type ShownChange, type TaskItem, type TaskService, type UndoOutcome, undoNotice, type ViewChoice, type ViewMode, projectNodeOf, type ProjectsNodeId, type UndoService } from "../../core/application/contracts";
import type { ScreenContext, ScreenView, SectionNameEnd, Destination, Edge, EntryBar, EntryCommit, EntryDraft, EntryField, LevelRange, ListId, MenuAction, MenuFrom, MenuModel, Now, PlaceId, RenameStart, ScreenData, ScreenPort } from "../ui/engine/port";
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

/**
 * The core's view as the engine draws it. By project is not offered until the engine draws it (Decision 149): a kept By
 * project draws two columns, as the core's default.
 */
function screenViewOf(choice: ViewChoice): ScreenView {
	const drawn = (mode: ViewMode): ViewMode => (mode === "byProject" ? "twoColumns" : mode);
	const chosen = drawn(choice.chosen);
	const modes = choice.modes.filter((option) => option.mode !== "byProject").map((option) => ({ ...option, checked: option.mode === chosen }));
	const mode = drawn(choice.mode);
	return { mode, modes, icon: modes.find((option) => option.checked)?.icon ?? choice.icon, ribbon: mode === "twoColumns", subprojects: choice.subprojects };
}

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
	private readonly screens = new Set<CorePort>();
	/** The main screen's view, a wide screen's and a narrow one's, as last read. */
	private readonly views = new Map<boolean, ScreenView>();
	/** Each project note's block's view, by the note's path and the screen's width, as last read. */
	private readonly noteViews = new Map<string, { readonly path: string; readonly wide: boolean; view: ScreenView }>();
	/** The calendars kept fresh while a screen is on view (`keepFresh`, the host's); none until the host asks. */
	private poll: CalendarPoll | null = null;
	private readonly events = new Map<LocalDate, DayEvents>();
	private readonly asked = new Set<LocalDate>();
	private readonly offs: (() => void)[];
	/** The same read within each project a screen is drawn in (`ScreenReader.within`), kept until the next read. */
	private readonly readers = new Map<string, ScreenReader>();
	/** The words of an empty list's plate under a filter (the core's `ViewChoice.emptyLabel`), once the core's view is read. */
	plateWords: string | null = null;
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
		void core.tasks.funnelView(true).then((view) => {
			this.plateWords = view.view.emptyLabel;
			this.changed();
		});
		this.offs = [core.tasks.onChange(() => void this.refresh()), core.tasks.onShownChange((change) => this.settingsChanged(change)), core.days.onDayChange((change) => this.dayChanged(change)), core.undo.onChange(() => this.changed()), core.calendars.onChange(() => this.forgetEvents())];
	}

	/** A screen's port in `context`, told of every change from now on. */
	view(context: string, note: string | null): CorePort {
		const view = new CorePort(this, context, note);
		this.screens.add(view);
		return view;
	}

	release(view: CorePort): void {
		this.screens.delete(view);
	}

	dispose(): void {
		for (const off of this.offs) off();
		this.screens.clear();
		this.poll?.stop();
		this.poll = null;
	}

	/** The calendars kept fresh by the core's polling (F109) from now until `dispose`: each tick reads the shown days' events anew. */
	keepFresh(hidden: () => boolean): CalendarPoll {
		this.poll?.stop();
		this.poll = this.core.calendars.keepFresh({ refresh: () => this.refreshEvents(), hidden });
		return this.poll;
	}

	/** Refresh now (F276): through the polling, which asks the phone first; without it, the day's events fetched afresh. */
	refreshSources(): Promise<void> {
		return this.poll ? this.poll.refreshNow() : this.refreshEvents();
	}

	/** The sources refreshed and the files read again (the core's `events` for a refresh); every day drawn from them anew. */
	private async refreshEvents(): Promise<void> {
		await this.core.calendars.events(this.core.days.today(), "refresh").fresh?.();
		this.forgetEvents();
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
			await Promise.all([...[...this.views.keys()].map((wide) => this.askView(wide)), ...[...this.noteViews.values()].map(({ path, wide }) => this.askNoteView(path, wide))]);
		});
		this.queued = run;
		this.reads = run.catch(() => undefined);
		return run;
	}

	/** The main screen's view on a `wide` screen or a narrow one: the device's as the core read it last, asked again in the background. */
	viewOf(wide: boolean): ScreenView {
		const kept = this.views.get(wide);
		if (kept) return kept;
		const first = screenViewOf(this.core.tasks.firstView(wide, false));
		this.views.set(wide, first);
		void this.askView(wide);
		return first;
	}

	/** A project note's block's view (the core's `projectNoteView`): rows unless another mode was picked in a note; the device's kept one first, asked again in the background. */
	noteViewOf(path: string, wide: boolean): ScreenView {
		const key = `${wide} ${path}`;
		const kept = this.noteViews.get(key);
		if (kept) return kept.view;
		this.noteViews.set(key, { path, wide, view: screenViewOf(this.core.tasks.firstView(wide, true)) });
		void this.askNoteView(path, wide);
		return this.noteViews.get(key)!.view;
	}

	private async askNoteView(path: string, wide: boolean): Promise<void> {
		const read = await this.core.tasks.projectNoteView(path, wide);
		const kept = this.noteViews.get(`${wide} ${path}`);
		if (!read || !kept) return;
		const next = screenViewOf(read.view);
		if (JSON.stringify(next) === JSON.stringify(kept.view)) return;
		kept.view = next;
		this.changed();
	}

	/** The view as the core reads it now; every screen told when it differs. */
	async askView(wide: boolean): Promise<void> {
		const next = screenViewOf((await this.core.tasks.funnelView(wide)).view);
		if (JSON.stringify(next) === JSON.stringify(this.views.get(wide))) return;
		this.views.set(wide, next);
		this.changed();
	}

	/** A write of the device's view (the mode, Subprojects): every view asked again once it is kept. */
	async keepView(write: Promise<void>): Promise<void> {
		await write;
		await this.refresh();
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

	/** A day ended: the lists read anew. Another hour for the day's start: every screen opens today afresh, its lists read in the new day. */
	private dayChanged(change: DayChange): void {
		void this.refresh();
		if (change === "moved") for (const view of this.screens) view.dayMoved();
	}

	private forgetEvents(): void {
		this.events.clear();
		this.asked.clear();
		this.changed();
	}

	private changed(): void {
		for (const view of this.screens) view.changed();
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
	private readonly todayListeners = new Set<() => void>();
	private readonly cache = new Map<string, ScreenData>();
	private readonly entry: CoreEntry;

	/** @internal Made by `CoreReads.view`. */
	constructor(
		private readonly shared: CoreReads,
		/** The context this screen is drawn in: what its writes and menus go by. */
		private context: string,
		/** The project note whose block this screen is: its view is the note's own; null elsewhere. */
		private readonly note: string | null = null,
	) {
		this.entry = new CoreEntry(shared.core, shared.drawing, () => this.reader, () => this.refresh(), shared.queue, () => this.filter());
	}

	/** The port over `core`, once the file is read, in every task's context. */
	static async open(core: CorePortServices): Promise<CorePort> {
		return new CoreReads(core, await core.tasks.reader(null)).view(EVERY, null);
	}

	/** Another screen's port over the same read, in `context` (every task when absent). */
	within(context?: ScreenContext): CorePort {
		return this.shared.view(context?.project ?? EVERY, context?.note ?? null);
	}

	/** This screen's port is let go: its screen is gone. */
	release(): void {
		this.listeners.clear();
		this.todayListeners.clear();
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
			data = this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date) }, this.plate());
			this.cache.set(key, data);
		}
		return data;
	}

	view(wide: boolean): ScreenView {
		return this.note === null ? this.shared.viewOf(wide) : this.shared.noteViewOf(this.note, wide);
	}

	/** A mode picked: the main screen's, or in a note's block every block's (the core's `setNoteViewMode`). */
	setViewMode(mode: ViewMode): Promise<void> {
		return this.shared.keepView(this.note === null ? this.core.tasks.setViewMode(mode) : this.core.tasks.setNoteViewMode(mode));
	}

	/** The calendars kept fresh while the host's screens are on view (F109); the host wakes it and stops it with the plugin. */
	keepFresh(hidden: () => boolean): CalendarPoll {
		return this.shared.keepFresh(hidden);
	}

	refreshSources(): Promise<void> {
		return this.shared.refreshSources();
	}

	toggleSubprojects(): Promise<void> {
		return this.shared.keepView(this.core.tasks.toggleSubprojects());
	}

	onDayStartMoved(listener: () => void): () => void {
		this.todayListeners.add(listener);
		return () => this.todayListeners.delete(listener);
	}

	/** @internal The day starts at another hour now. */
	dayMoved(): void {
		for (const listener of this.todayListeners) listener();
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
		return this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date) }, this.plate());
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

	firstStepView(id: string, dayOffset: number, context?: ScreenContext): ScreenData {
		this.use(context);
		const item = this.reader.item(id);
		const date = this.dateOf(dayOffset);
		if (!item) return this.read(dayOffset);
		const screen = this.core.tasks.firstStepScreen(this.reader.screen(date), item.key);
		return this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date) }, this.plate());
	}

	async firstStep(id: string, text: string): Promise<void> {
		const item = this.reader.item(id);
		if (!item) return;
		await this.core.tasks.firstStep(item.key, text);
		await this.refresh();
	}

	async fold(id: string): Promise<void> {
		const item = this.reader.item(id);
		if (!item) return;
		await this.core.tasks.toggleCollapsed(item.key);
		await this.refresh();
	}

	sectionNameEnd(how: SectionNameEnd, text: string): string | null {
		let name: string | null = null;
		const entry = new SectionNameEntry((ended) => (name = ended));
		if (how === "enter") entry.enter(text);
		else if (how === "escape") entry.escape();
		else entry.blur();
		return name;
	}

	async renameSection(list: ListId, dayOffset: number, section: string, name: string): Promise<void> {
		const found = this.sectionOf(list, dayOffset, section);
		if (!found?.group.menu?.rename) return;
		await this.core.tasks.renameGroup(found.list, found.group.menu.section, name);
		await this.refresh();
	}

	async removeSection(list: ListId, dayOffset: number, section: string): Promise<void> {
		const found = this.sectionOf(list, dayOffset, section);
		if (!found?.group.menu?.remove) return;
		await this.core.tasks.removeGroup(found.list, found.group.menu.section);
		await this.refresh();
	}

	sectionMoves(list: ListId, dayOffset: number, section: string, before: string | null): boolean {
		return this.groupMove(list, dayOffset, section, before) !== null;
	}

	async moveSection(list: ListId, dayOffset: number, section: string, before: string | null): Promise<void> {
		const move = this.groupMove(list, dayOffset, section, before);
		if (!move) return;
		await this.core.tasks.moveGroup(move.list, move.name, move.place);
		await this.refresh();
	}

	/** The screen read now with the section's header and its rows standing before the header `before` (the list's end for null), as `moveGroup` leaves them. */
	previewSection(list: ListId, dayOffset: number, section: string, before: string | null, context?: ScreenContext): ScreenData {
		const data = this.read(dayOffset, context);
		const rows = data.lists[list].rows;
		const from = rows.findIndex((row) => row.id === section);
		if (from < 0 || !this.sectionMoves(list, dayOffset, section, before)) return data;
		let to = from + 1;
		while (to < rows.length && rows[to].kind !== "section") to++;
		const moved = rows.slice(from, to);
		const rest = [...rows.slice(0, from), ...rows.slice(to)];
		const at = before === null ? rest.length : rest.findIndex((row) => row.id === before);
		const next = [...rest.slice(0, at < 0 ? rest.length : at), ...moved, ...rest.slice(at < 0 ? rest.length : at)];
		return { ...data, lists: { ...data.lists, [list]: { ...data.lists[list], rows: next } } };
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

	/** The column `list` of the day `dayOffset` as it draws, and the grouped list whose sections it shows; null for one that shows none. */
	private columnOf(list: ListId, dayOffset: number): { readonly column: ColumnList; readonly list: NonNullable<ColumnList["sections"]>["list"] } | null {
		const column = this.drawing.column(this.reader.screen(this.dateOf(dayOffset)), COLUMNS[list]);
		return column.sections ? { column, list: column.sections.list } : null;
	}

	/** The group of `list` whose header is `section`, and its grouped list. */
	private sectionOf(list: ListId, dayOffset: number, section: string) {
		const found = this.columnOf(list, dayOffset);
		const group = found?.column.groups.find((g) => g.header && g.id === section);
		return found && group ? { list: found.list, group } : null;
	}

	/** Where the section lifted goes let go before `before` (the core's `groupPlaceOf` over the headers the column draws); null at its own place. */
	private groupMove(list: ListId, dayOffset: number, section: string, before: string | null) {
		const found = this.columnOf(list, dayOffset);
		if (!found) return null;
		const groups = found.column.groups.filter((g) => g.header);
		const lifted = groups.findIndex((g) => g.id === section);
		const slot = before === null ? groups.length : groups.findIndex((g) => g.id === before);
		if (lifted < 0 || slot < 0) return null;
		const place = groupPlaceOf(groups.map((g) => g.name), lifted, slot);
		return place && { list: found.list, name: groups[lifted].name, place };
	}

	/** The day `dayOffset` days from today, as the core steps days. */
	private dateOf(dayOffset: number): LocalDate {
		return this.core.days.step(this.core.days.today(), dayOffset);
	}

	/** The held read's screen of `date`, a task held by a dot drawn at `held`. */
	private drawn(date: LocalDate, held: ScreenSource["held"] | null): ScreenData {
		const screen = this.reader.screen(date);
		return this.drawing.draw({ date, screen, lists: this.drawing.listsOf(screen), events: this.eventsOf(date), ...(held && { held }) }, this.plate());
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

	/** An empty list's plate (F64): the core's words under a filter, as its view's plates are; none for every task. */
	private plate(): string | null {
		return this.context === EVERY ? null : this.shared.plateWords;
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

import { ItemView, MarkdownView, Notice, Platform, Scope, type WorkspaceLeaf } from "obsidian";
import { type CalendarEvent, type CalendarService, DayBoundary, type GroupedList, type GroupName, StaleTaskError, type TaskItem, type TaskKey, type TaskService, type UndoService } from "../application/contracts";
import type { Clock, SettingsStore } from "../application/ports";
import { LIST_WIDTH_MIN, type PriorityLevel, type RightMode, sameLevels, usableLevels, type ZoomLevel } from "../settings";
import { renderAllDayRows } from "./AllDayRow";
import { BulkController, type BulkSections } from "./BulkController";
import type { PickedCard } from "./TaskSelection";
import { CalendarPolling } from "./CalendarPolling";
import type { Theme } from "./eventColors";
import { addDays } from "./dates";
import { DayData } from "./DayData";
import { ColumnHeaders } from "./ColumnHeaders";
import { ColumnSwitch } from "./ColumnSwitch";
import { DragController } from "./drag/DragController";
import { ListDrop } from "./drag/ListDrop";
import { sameTask } from "./drag/listPlace";
import type { ColumnSections, DropResult, ListColumn, TaskDragPayload } from "./drag/DropTarget";
import { GroupDrag } from "./drag/GroupDrag";
import { GroupMenu } from "./menu/GroupMenu";
import type { ListGroup } from "./listGroups";
import { GroupNameField } from "./GroupNameField";
import { TimelineDrop } from "./drag/TimelineDrop";
import { GestureArbiter } from "./gestures";
import { detectHaptics, type HapticsHost } from "./haptics";
import { EventMenu } from "./menu/EventMenu";
import { type SectionChoice, TaskMenu } from "./menu/TaskMenu";
import type { EditorOwner } from "./markdown/EmbeddedEditor";
import { ObsidianMarkdown } from "./markdown/ObsidianMarkdown";
import { MarkdownTitleField } from "./quick/MarkdownTitleField";
import { QuickEntryController } from "./quick/QuickEntryController";
import { DescriptionSheet } from "./sheet/DescriptionSheet";
import type { TaskLink } from "./TaskTitle";
import { SourcesPopover } from "./sources/SourcesPopover";
import { levelsFor, stepFor } from "./zoomLevels";
import { dayColumn } from "./dayColumn";
import { dayTitle } from "./dayTitle";
import { DESIGN, DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import { Divider } from "./Divider";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "./listWidth";
import { clear, el, px } from "./dom";
import { NewTaskButton } from "./NewTaskButton";
import { UndoButton } from "./UndoButton";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { type ScreenPart, ScreenParts } from "./ScreenParts";
import { type Shift, stepScreen } from "./screens";
import { Swipe, swipeStartsAt } from "./Swipe";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate } from "./types";

export const VIEW_TYPE = "task-calendar";
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
/** The gesture that holds the screen while a new section's name is typed: no redraw takes the field away. */
const NAMING = "naming";

/** A new section asked for from a card's menu: the column the card waits at the end of, and whose sections. */
interface NameGroup extends ColumnSections {
	readonly column: ListColumn;
}

/** The task with `key` among `items` and their subtasks. */
function findTask(items: readonly TaskItem[], key: TaskKey): TaskItem | null {
	for (const item of items) {
		if (sameTask(item.key, key)) return item;
		const inner = findTask(item.subtasks, key);
		if (inner) return inner;
	}
	return null;
}

export interface ViewDeps {
	readonly tasks: TaskService;
	/** The plugin's own changes of the tasks file, taken back by the corner button and Cmd+Z. */
	readonly undo: UndoService;
	readonly calendars: CalendarService;
	readonly settings: SettingsStore;
	readonly clock: Clock;
	/** Asks the phone for fresh work calendar events; a refresh the user asks for runs it before reading the sources. */
	exportWorkCalendar(): void;
	/** Apple's Calendar at the event. */
	openInCalendar(event: CalendarEvent): void;
}

/**
 * The screen: a window two columns wide on a strip of four, Inbox, Soon, the list of the day (Now) and the day's timeline,
 * each list under its header. The window shows Inbox and Soon or Soon and Now, halved by a fixed divider, or Now and the
 * timeline, parted by the divider that sets the list's width; the switch at the bottom slides the strip, headers and all.
 */
export class TaskCalendarView extends ItemView {
	private selectedDate: LocalDate;
	/** The day the last minute's tick saw as today: the next day's first tick releases the slots and reads the tasks anew. */
	private shownToday: LocalDate;
	/** A minute passed while the view was hidden: it ticks once as soon as it shows again. */
	private missedTick = false;
	private headers: ColumnHeaders | null = null;
	private switcher: ColumnSwitch | null = null;
	private leftEl: HTMLElement | null = null;
	private list: TaskList | null = null;
	private soonEl: HTMLElement | null = null;
	private soonList: TaskList | null = null;
	private soonDrop: ListDrop | null = null;
	private inboxEl: HTMLElement | null = null;
	private inboxList: TaskList | null = null;
	private inboxDrop: ListDrop | null = null;
	private rightEl: HTMLElement | null = null;
	private allDayEl: HTMLElement | null = null;
	private timeline: Timeline | null = null;
	private hourPx: number = DESIGN.hourPx;
	private readonly data: DayData;
	/** Obsidian's desktop status bar over the view's bottom right corner. */
	private readonly polling: CalendarPolling;
	/** The frame, the tasks and the events, each drawn when it changes; a gesture holds them all. */
	private readonly parts = new ScreenParts({ busy: () => this.arbiter.busy, draw: (parts) => this.draw(parts) });
	/** The quick field's editor while it has the focus: Obsidian's commands and hotkeys go to it. */
	activeEditor: EditorOwner | null = null;
	private scrolledFor: LocalDate | null = null;
	private dayStartHour: number;
	/** The levels the tasks were last read with: other levels colour them anew. */
	private priorities: readonly PriorityLevel[];
	private readonly arbiter = new GestureArbiter();
	private readonly haptics = detectHaptics(window as unknown as HapticsHost);
	private readonly drag: DragController;
	/** Picking several list cards on the desktop, and what is done to them all. */
	private readonly bulk: BulkController;
	private leftDrop: ListDrop | null = null;
	private timelineDrop: TimelineDrop | null = null;
	private zoomFrame = 0;
	/** The pinch settled on the whole day: it keeps fitting as the timeline's height changes. */
	private wholeDay = false;
	private newTask: NewTaskButton | null = null;
	private newSoon: NewTaskButton | null = null;
	private newInbox: NewTaskButton | null = null;
	private readonly groupDrag: GroupDrag;
	/** A card sent to New section, waiting at the end of its list for the section's name. */
	private naming: { readonly item: TaskItem; readonly asked: NameGroup } | null = null;
	private switching = 0;
	/** Typing tasks in place: the field, the bar over the keyboard, the plus. */
	private quick: QuickEntryController | null = null;
	private readonly unsubscribe: (() => void)[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: ViewDeps,
	) {
		super(leaf);
		this.dayStartHour = this.settings.dayStartHour;
		this.priorities = this.settings.priorities;
		this.selectedDate = this.today();
		this.shownToday = this.selectedDate;
		this.data = new DayData({ tasks: deps.tasks, calendars: deps.calendars, date: () => this.selectedDate, onUpdate: (part) => this.parts.request(part) });
		this.polling = new CalendarPolling({
			refresh: () => this.data.calendars(),
			intervalMs: () => this.settings.google.refreshSeconds * SECOND_MS,
			hidden: () => document.hidden,
			timers: { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) },
		});
		this.groupDrag = new GroupDrag({
			longPressMs: () => this.settings.longPressMs,
			arbiter: this.arbiter,
			haptics: this.haptics,
			ungroupedName: () => this.settings.groups.ungrouped,
			onTap: (head, list, group) => this.showGroupMenu(head, list, group),
			onMove: (list, group, place) => this.act(() => this.deps.tasks.moveGroup(list, group, place)),
		});
		this.bulk = new BulkController({
			root: this.contentEl,
			apply: (steps) => this.act(() => this.deps.tasks.applyAll(steps)),
			today: () => this.today(),
			day: () => this.selectedDate,
			levels: () => usableLevels(this.settings.priorities),
			cards: (column) => this.listOf(column)?.cards.map((entry) => entry.card) ?? [],
			sections: (cards) => this.bulkSections(cards),
			desktop: () => !this.contentEl.ownerDocument.body.classList.contains("is-mobile"),
			isMod: (e) => (Platform.isMacOS ? e.metaKey : e.ctrlKey),
		});
		this.drag = new DragController({
			longPressMs: () => this.settings.longPressMs,
			day: () => this.selectedDate,
			step: () => stepFor(this.hourPx),
			timeline: () => this.timeline,
			targets: (drag) => [...this.bulk.targets(drag), ...this.shownDrops()],
			pick: (_item, card, e, how) => {
				const picked = this.bulk.selection.cardOf(card);
				return picked !== undefined && this.bulk.pick(picked, e, how);
			},
			carried: (item) => this.bulk.carried(item),
			haptics: this.haptics,
			arbiter: this.arbiter,
			onDragging: (active) => {
				if (!active) this.bulk.settled();
				this.quick?.onDragging(active);
				this.contentEl.classList.toggle("is-dragging", active);
			},
			onResult: (drag, result) => this.applyDrop(drag, result),
			onResize: (item, slot) => this.act(() => this.deps.tasks.setSlot(item.key, slot)),
			onMenu: (item, source, lifted) => this.showMenu(item, source, lifted),
			onRename: (item) => this.quick?.rename(item),
			newSlot: () => this.timelineDrop,
			onNewSlot: (slot) => this.quick?.openSlot(slot),
		});
	}

	override getViewType(): string {
		return VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Task Calendar";
	}

	override getIcon(): string {
		return "calendar-days";
	}

	/**
	 * Obsidian opens its side panels on swipes from the screen's edges; inside the view the fingers belong to the view. While a
	 * gesture holds the screen the touches are also kept from scrolling: iOS would otherwise cancel the pointer mid-drag.
	 */
	override async onOpen(): Promise<void> {
		const root = this.contentEl;
		clear(root);
		root.classList.add("task-calendar", "tc-view");
		this.restoreZoom();
		this.fitListWidth();
		this.headers = new ColumnHeaders(root, {
			title: () => dayTitle(this.selectedDate, this.today()),
			onStep: (days) => void this.afterEntry(() => this.select(addDays(this.selectedDate, days))),
			onToday: () => void this.afterEntry(() => this.select(this.today())),
			inboxName: () => this.settings.sections.inbox,
			soonName: () => this.settings.sections.soon,
		});
		this.leftEl = el(root, "div", "tc-left");
		this.list = new TaskList(el(this.leftEl, "div"), {
			items: () => this.unnamed(this.data.day?.list ?? []),
			day: () => this.selectedDate,
			grouped: () => this.sectionsOf("left") !== null,
			pending: () => this.namingIn("left"),
			entry: () => this.quick?.entryIn("left") ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group) => this.groupDrag.attach(head, this.sectionsOf("left")?.list ?? "now", this.list!, group),
			ungroupedName: () => this.settings.groups.ungrouped,
			onCard: (card, item, subtree) => this.attachCard(card, item, "left", subtree),
		});
		this.leftDrop = new ListDrop(this.list, this.leftEl, "left", () => true, () => this.sectionsOf("left"));
		this.inboxEl = el(root, "div", "tc-inbox");
		this.inboxList = new TaskList(el(this.inboxEl, "div"), {
			items: () => this.unnamed(this.data.inbox),
			day: () => null,
			grouped: () => this.sectionsOf("inbox") !== null,
			pending: () => this.namingIn("inbox"),
			entry: () => this.quick?.entryIn("inbox") ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group) => this.groupDrag.attach(head, "inbox", this.inboxList!, group),
			ungroupedName: () => this.settings.groups.ungrouped,
			onCard: (card, item, subtree) => this.attachCard(card, item, "inbox", subtree),
		});
		this.inboxDrop = new ListDrop(this.inboxList, this.inboxEl, "inbox", (drag) => drag.from === "inbox" || drag.from === "soon" || drag.from === "new", () => this.sectionsOf("inbox"));
		this.soonEl = el(root, "div", "tc-soon");
		this.soonList = new TaskList(el(this.soonEl, "div"), {
			items: () => this.unnamed(this.data.soon),
			day: () => null,
			grouped: () => this.sectionsOf("soon") !== null,
			pending: () => this.namingIn("soon"),
			entry: () => this.quick?.entryIn("soon") ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group) => this.groupDrag.attach(head, "soon", this.soonList!, group),
			ungroupedName: () => this.settings.groups.ungrouped,
			onCard: (card, item, subtree) => this.attachCard(card, item, "soon", subtree),
		});
		this.soonDrop = new ListDrop(this.soonList, this.soonEl, "soon", (drag) => drag.from !== "timeline", () => this.sectionsOf("soon"));
		el(el(root, "div", "tc-divider is-fixed is-inbox"), "div", "tc-divider-line");
		el(el(root, "div", "tc-divider is-fixed"), "div", "tc-divider-line");
		new Divider(el(root, "div"), {
			width: () => shownListWidth(this.settings.listShare, root.clientWidth),
			onWidth: (width) => root.style.setProperty(PROPERTY.listWidth, px(width)),
			onRelease: (width) => void this.deps.settings.update({ listShare: listShareOf(width, root.clientWidth) }).then(() => this.parts.request("frame")),
			min: LIST_WIDTH_MIN,
			max: () => listWidthMax(root.clientWidth),
			center: () => centeredListWidth(root.clientWidth),
			onSnap: () => this.haptics.tap(),
			arbiter: this.arbiter,
		});
		this.rightEl = el(root, "div", "tc-right");
		this.allDayEl = el(this.rightEl, "div");
		this.timeline = new Timeline(el(this.rightEl, "div"), {
			theme: () => this.theme(),
			date: () => this.selectedDate,
			today: () => this.today(),
			boundary: () => this.boundary(),
			hourPx: () => this.hourPx,
			tasks: () => this.data.day?.slotted ?? [],
			events: () => this.data.events,
			now: () => this.deps.clock.now(),
			onResize: () => this.fitWholeDay(),
			onBlock: (block, item) => this.drag.attachBlock(block, item),
			onEvent: (block, event) => this.drag.attachEvent(block, () => EventMenu.open({ source: block, openInCalendar: () => this.deps.openInCalendar(event) })),
			onGrip: (block, item, edge, e) => this.drag.grip(block, item, edge, e),
		});
		el(root, "div", "tc-fade");
		this.timelineDrop = new TimelineDrop(this.timeline, { step: () => stepFor(this.hourPx) });
		this.drag.attachCanvas(this.timeline.canvas);
		const timeline = this.timeline;
		new PinchZoom(timeline.el, {
			hourPx: () => this.hourPx,
			min: () => this.zoomLevels()[0].hourPx,
			max: () => this.zoomLevels()[this.zoomLevels().length - 1].hourPx,
			arbiter: this.arbiter,
			minutesAt: (y) => timeline.minutesAt(y),
			onScale: (hourPx, anchor) => this.zoom(hourPx, anchor),
			onRelease: (hourPx) => this.settleZoom(hourPx),
		});
		this.newTask = new NewTaskButton(this.leftEl, "now", () => this.quick?.openAtEnd("left"));
		this.newSoon = new NewTaskButton(this.soonEl, "soon", () => this.quick?.openAtEnd("soon"));
		this.newInbox = new NewTaskButton(this.inboxEl, "inbox", () => this.quick?.openAtEnd("inbox"));
		this.newTask.pressOnDoubleClick(this.leftEl, this.list.el);
		this.newSoon.pressOnDoubleClick(this.soonEl, this.soonList.el);
		this.newInbox.pressOnDoubleClick(this.inboxEl, this.inboxList.el);
		const switcher = new ColumnSwitch(root, {
			value: () => this.settings.rightMode,
			onChange: (mode) => void this.afterEntry(() => this.setMode(mode)),
			dot: () => this.data.statuses.some((s) => s.stale),
			onSources: () => this.showSources(switcher.el),
			longPressMs: () => this.settings.longPressMs,
			arbiter: this.arbiter,
		});
		this.switcher = switcher;
		this.quick = new QuickEntryController({
			root,
			tasks: this.deps.tasks,
			arbiter: this.arbiter,
			drag: this.drag,
			titleField: (parent, opts) => new MarkdownTitleField(this.app, this, this.settings.tasksFile, parent, opts),
			list: (column) => this.listOf(column),
			timeline: () => this.timeline,
			task: (key) => findTask(this.data.day?.slotted ?? [], key),
			newTasks: () => [this.newTask, this.newSoon, this.newInbox].filter((button) => button !== null),
			dropTargets: () => {
				const shown = this.shownDrops();
				return { lists: shown.filter((drop) => drop instanceof ListDrop), timeline: shown.find((drop) => drop instanceof TimelineDrop) ?? null };
			},
			levels: () => this.settings.priorities,
			today: () => this.today(),
			desktop: () => !root.ownerDocument.body.classList.contains("is-mobile"),
			chromeTop: () => statusBarTop(root.ownerDocument),
			toolbarTop: () => keyboardToolbarTop(root.ownerDocument),
			day: () => this.selectedDate,
			mode: () => this.settings.rightMode,
			turnTo: (mode) => this.switcher?.show(mode),
			showDay: (date) => {
				this.select(date);
				return this.data.tasks();
			},
			fresh: () => this.data.tasks(),
			render: () => this.render(),
			onError: (error) => this.reportFailure(error),
		});
		const undo = new UndoButton(root, this.deps.undo, () => void this.undoStep("undo"));
		this.unsubscribe.push(() => undo.destroy());
		this.scope = new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", () => this.undoKey("undo"));
		this.scope.register(["Mod", "Shift"], "z", () => this.undoKey("redo"));
		new Swipe(root, {
			arbiter: this.arbiter,
			accepts: swipeStartsAt,
			onSwipe: (shift) => void this.afterEntry(() => this.step(shift)),
		});
		this.unsubscribe.push(
			this.deps.tasks.onChange(() => void this.data.tasks()),
			this.deps.calendars.onChange(() => void this.data.calendars()),
			this.deps.settings.onChange(() => this.onSettings()),
		);
		this.registerDomEvent(window, "focus", () => void this.polling.refresh());
		this.registerDomEvent(document, "visibilitychange", () => {
			if (document.hidden) return;
			void this.polling.refresh();
			this.catchUpTick();
		});
		this.registerDomEvent(root, "touchmove", (e) => {
			if (this.arbiter.busy || e.touches.length > 1) e.preventDefault();
			e.stopPropagation();
		}, { passive: false });
		for (const type of ["touchstart", "touchend", "touchcancel"] as const) this.registerDomEvent(root, type, (e) => e.stopPropagation(), { passive: true });
		this.registerDomEvent(document, "pointerdown", (e) => this.deselectUnless(e.target), { capture: true });
		this.registerDomEvent(document, "pointerdown", (e) => this.bulk.onPress(e.target), { capture: true });
		this.registerDomEvent(document, "keydown", (e) => this.bulk.onKey(e));
		this.arbiter.onIdle(() => this.parts.flush());
		this.registerEvent(this.app.workspace.on("css-change", () => this.parts.request("events")));
		this.registerInterval(window.setInterval(() => void this.tick(), MINUTE_MS));
		this.polling.start();
		this.render();
		await this.data.load();
	}

	/**
	 * Once a minute: the now line moves, nothing else is drawn. A day that ended releases its slots (the file is written
	 * only when a rule fires) and the lists, which depend on today, are drawn and read anew. A hidden view waits.
	 */
	private async tick(): Promise<void> {
		if (document.hidden || !this.contentEl.isShown()) {
			this.missedTick = true;
			return;
		}
		this.missedTick = false;
		const today = this.today();
		if (today === this.shownToday) {
			this.timeline?.tickNow();
			return;
		}
		this.shownToday = today;
		try {
			await this.deps.tasks.normalize();
		} finally {
			this.parts.request("frame", "tasks");
			void this.data.tasks();
		}
	}

	private catchUpTick(): void {
		if (this.missedTick) void this.tick();
	}

	override async onClose(): Promise<void> {
		this.quick?.close();
		this.polling.stop();
		this.unsubscribe.splice(0).forEach((off) => off());
	}

	override onResize(): void {
		this.fitListWidth();
		this.quick?.reveal();
		this.catchUpTick();
	}

	private get settings() {
		return this.deps.settings.get();
	}

	private today(): LocalDate {
		return this.boundary().dayOf(this.deps.clock.now());
	}

	private boundary(): DayBoundary {
		return new DayBoundary(this.settings.dayStartHour);
	}

	/** Another hour for the day's start moves today and the timeline: the screen opens today afresh. Another card size restacks the timeline. */
	private onSettings(): void {
		this.timeline?.layoutTasks();
		if (!sameLevels(this.settings.priorities, this.priorities)) {
			this.priorities = this.settings.priorities;
			void this.data.tasks();
		}
		if (this.settings.dayStartHour === this.dayStartHour) return;
		this.dayStartHour = this.settings.dayStartHour;
		this.scrolledFor = null;
		void this.afterEntry(() => this.select(this.today()));
	}

	/** The tokens follow Obsidian's theme by themselves; the event colours the code computes follow it here. */
	private theme(): Theme {
		return document.body.classList.contains("theme-light") ? "light" : "dark";
	}

	/** A view not laid out yet has no width to take a share of: it keeps the design's width until it has one. */
	private fitListWidth(): void {
		const width = this.contentEl.clientWidth;
		if (width > 0) this.contentEl.style.setProperty(PROPERTY.listWidth, px(shownListWidth(this.settings.listShare, width)));
	}

	/**
	 * Every switch of what the screen shows, another day or another pair of columns, waits for the entry to settle: the
	 * text typed is written for the day and the place it was typed at, before the lists change under it.
	 */
	private async afterEntry(change: () => void | Promise<void>): Promise<void> {
		await this.quick?.settle();
		await change();
	}

	/** The header shows the day at once; its tasks and events replace the last day's as they come. */
	private select(date: LocalDate): void {
		this.selectedDate = date;
		this.headers?.render();
		void this.data.selectDay();
	}

	/** A swipe walks the row of screens: the switch carries the window to its place, and the day turns as the arrows turn it. */
	private step(shift: Shift): void {
		const to = stepScreen({ mode: this.settings.rightMode, date: this.selectedDate }, shift, this.today());
		if (!to) return;
		if (to.date !== this.selectedDate) this.select(to.date);
		if (to.mode !== this.settings.rightMode) this.switcher?.show(to.mode);
	}

	/**
	 * The strip slides only while the window moves to the other pair, in step with the switch's pill, over the columns
	 * already drawn; the divider's drag and a resize move it at once. Once the choice is saved the frame follows it.
	 */
	private setMode(mode: RightMode): void {
		const root = this.contentEl;
		window.clearTimeout(this.switching);
		root.classList.add("is-switching");
		this.switching = window.setTimeout(() => root.classList.remove("is-switching"), tokenMs(root, DURATION.slide));
		this.showMode(mode);
		void this.deps.settings.update({ rightMode: mode }).then(() => this.parts.request("frame"));
	}

	private showMode(mode: RightMode): void {
		this.contentEl.classList.toggle("is-lists", mode === "soon");
		this.contentEl.classList.toggle("is-inbox", mode === "inbox");
	}

	/** A tap anywhere but the selected card, its dots, or the menu over it lets the selection go. */
	private deselectUnless(target: EventTarget | null): void {
		if (!this.timeline?.selection) return;
		if (target instanceof Element && target.closest(".tc-block.is-selected, .tc-grips, .tc-lifted, .tc-panel, .tc-backdrop")) return;
		this.timeline.select(null);
	}

	/** Runs one change to the file and resolves once the screen shows it; a task changed under us is reported instead. */
	private async act(change: () => Promise<void>): Promise<void> {
		try {
			await change();
		} catch (error) {
			if (!(error instanceof StaleTaskError)) throw error;
			new Notice(error.message);
		}
		await this.data.tasks();
	}

	/** Cmd+Z and Cmd+Shift+Z in the calendar; in a field they stay the field's, taking typing back. */
	private undoKey(step: "undo" | "redo"): boolean {
		const focus = this.contentEl.ownerDocument.activeElement;
		if (focus instanceof HTMLElement && (focus.isContentEditable || focus.matches("input, textarea"))) return true;
		void this.undoStep(step);
		return false;
	}

	/** A step back or forward; one whose lines were edited since by hand or through Sync is said and dropped. */
	private async undoStep(step: "undo" | "redo"): Promise<void> {
		const outcome = await (step === "undo" ? this.deps.undo.undo() : this.deps.undo.redo());
		if (outcome === "conflict") new Notice(step === "undo" ? "Can’t undo: the tasks file changed" : "Can’t redo: the tasks file changed");
		if (outcome !== "nothing") await this.data.tasks();
	}

	/** A write the screen did not wait for failed: said as any failed change is, and the lists show the file as it is. */
	private reportFailure(error: unknown): void {
		new Notice(error instanceof Error ? error.message : String(error));
		void this.data.tasks();
	}

	/** The settings' levels at this screen's height, the whole day first; the settings' own before the timeline is laid out. */
	private zoomLevels(): ZoomLevel[] {
		const configured = this.settings.zoomLevels;
		return levelsFor(this.timeline?.wholeDayHourPx() ?? Math.min(...configured.map((l) => l.hourPx)), configured);
	}

	/** The timeline opens at the zoom it was left at; the whole day takes its height once the timeline is laid out. */
	private restoreZoom(): void {
		const zoom = this.settings.zoom;
		this.wholeDay = zoom === "wholeDay";
		if (typeof zoom === "number" && zoom > 0) this.hourPx = zoom;
	}

	/** Zoomed out to the whole day, the day keeps fitting when the timeline's height changes; a timeline grown past its day zooms in to fill it. */
	private fitWholeDay(): void {
		const whole = this.timeline?.wholeDayHourPx() ?? null;
		if (whole === null || this.zoomFrame || (!this.wholeDay && this.hourPx >= whole)) return;
		this.wholeDay = true;
		this.hourPx = whole;
		this.timeline?.layout();
	}

	/** Each finger reports its moves on its own; the timeline is laid out once per frame for the latest scale. */
	private zoom(hourPx: number, anchor: ZoomAnchor): void {
		this.wholeDay = false;
		if (this.zoomFrame) cancelAnimationFrame(this.zoomFrame);
		this.zoomFrame = requestAnimationFrame(() => {
			this.zoomFrame = 0;
			this.hourPx = hourPx;
			this.timeline?.zoomTo(anchor.minutes, anchor.clientY);
		});
	}

	/** Released, the scale stays where the fingers left it, and the timeline opens at it next time; out all the way it is the whole day. */
	private settleZoom(hourPx: number): void {
		this.wholeDay = hourPx <= this.zoomLevels()[0].hourPx;
		void this.deps.settings.update({ zoom: this.wholeDay ? "wholeDay" : hourPx });
	}

	/** The two columns the window shows, as places to drop. */
	private shownDrops(): (ListDrop | TimelineDrop)[] {
		const shown: Record<RightMode, (ListDrop | TimelineDrop | null)[]> = {
			calendar: [this.timelineDrop, this.leftDrop],
			soon: [this.soonDrop, this.leftDrop],
			inbox: [this.inboxDrop, this.soonDrop],
		};
		return shown[this.settings.rightMode].filter((target) => target !== null);
	}

	/** A list's card: its gestures. */
	private attachCard(card: HTMLElement, item: TaskItem, column: ListColumn, subtree: readonly HTMLElement[]): void {
		this.bulk.attach({ item, card, column, subtree });
		this.drag.attachCard(card, item, column, subtree);
	}

	/** What a drop means for the file: the table in spec §5.1. */
	private applyDrop(drag: TaskDragPayload, result: DropResult): Promise<void> {
		const key = drag.item.key;
		const tasks = this.deps.tasks;
		const steps = this.bulk.dropSteps(drag, result);
		if (steps) return this.act(() => tasks.applyAll(steps));
		return this.act(() => {
			if (result.kind === "slot") return tasks.setSlot(key, result.slot);
			if (result.kind === "clearSlot") return tasks.clearSlot(key);
			if (result.kind === "group") return tasks.moveToGroup(key, result.list, result.group, result.before, result.date ?? undefined);
			if (result.kind === "nest") return tasks.nest(key, result.parent, result.before);
			if (drag.from === "timeline") return tasks.clearSlot(key, { before: result.before, date: this.selectedDate });
			if (result.column === "left") return drag.from === "left" ? tasks.moveBefore(key, result.before, this.selectedDate) : tasks.moveToList(key, this.selectedDate);
			if (result.before) return tasks.moveBefore(key, result.before, this.selectedDate);
			if (drag.from === "left") return tasks.moveToSoon(key, this.selectedDate);
			return tasks.moveToEnd(key, result.column);
		});
	}

	/** The card waits at the end of its column under a field for the section's name; Enter makes the section, anything else puts it back. */
	private askGroupName(item: TaskItem, asked: NameGroup): void {
		this.naming = { item, asked };
		this.render();
		const slot = this.listOf(asked.column)?.pendingSlot;
		if (!slot || !this.arbiter.claim(NAMING)) {
			this.naming = null;
			this.render();
			return;
		}
		const field = GroupNameField.open(slot, {
			value: "",
			onDone: (name) => {
				this.naming = null;
				this.arbiter.release(NAMING);
				if (name) void this.act(() => this.deps.tasks.createGroup(item.key, asked.list, name, asked.date ?? undefined));
				else this.render();
			},
		});
		field.scrollIntoView({ block: "nearest" });
	}

	/** A section's menu; No section has none. */
	private showGroupMenu(head: HTMLElement, list: GroupedList, group: ListGroup): void {
		const name = group.name;
		if (name === null) return;
		GroupMenu.open(head, {
			name,
			onRename: () => this.renameInPlace(head, list, name),
			onRemove: () => void this.act(() => this.deps.tasks.removeGroup(list, name)),
		});
	}

	/** The name is edited where the header stands, the caret at its end. */
	private renameInPlace(head: HTMLElement, list: GroupedList, name: string): void {
		if (!this.arbiter.claim(NAMING)) return;
		const slot = el(null, "div", "tc-group-slot");
		head.before(slot);
		head.classList.add("is-renamed");
		GroupNameField.open(slot, {
			value: name,
			onDone: (to) => {
				this.arbiter.release(NAMING);
				if (to && to !== name) void this.act(() => this.deps.tasks.renameGroup(list, name, to));
				else this.render();
			},
		});
	}

	/**
	 * Whose sections a column shows (sections spec §5.1): the list its tasks lie in. Inbox and Soon their own; the day
	 * column Now's for today and Soon's for a later day, whose tasks lie in Soon with that day; a past day's none.
	 */
	private sectionsOf(column: ListColumn): ColumnSections | null {
		if (column !== "left") return { list: column, date: null };
		const { list, date, sections } = dayColumn(this.selectedDate, this.today());
		return sections ? { list, date } : null;
	}

	/**
	 * Whose sections a task's menu offers: its own list's, a task of Soon keeping its due date, and the list column its
	 * card stands in, which then shows the task waiting for a new section's name. None for a subtask, a done task, a card
	 * on the timeline or in a column without sections.
	 */
	private sectionsHome(item: TaskItem, card: HTMLElement): NameGroup | null {
		const list = item.key.section;
		if (item.parentText !== null || list === "done") return null;
		const columns: ListColumn[] = ["left", "soon", "inbox"];
		const column = columns.find((c) => this.listOf(c)?.el.contains(card));
		if (!column || !this.sectionsOf(column)) return null;
		return { column, list, date: list === "soon" ? item.dueDate : null };
	}

	/** The picked tasks' sections: only when they all stand in one list whose column shows its sections. */
	private bulkSections(cards: readonly PickedCard[]): BulkSections | null {
		const homes = cards.map((card) => this.sectionsHome(card.item, card.card));
		const first = homes[0];
		if (!first || homes.some((home) => !home || home.list !== first.list)) return null;
		const list = first.list;
		return {
			choice: this.sectionChoice(list, cards[0].item),
			shared: cards.every((card) => card.item.group === cards[0].item.group),
			change: (card, name) => {
				const date = (card.item.key.section === "soon" ? card.item.dueDate : null) ?? undefined;
				return name === null ? { kind: "moveToGroup", list, group: null, before: null, date } : { kind: "createGroup", list, name, date };
			},
		};
	}

	/** The sections the list has, in its order, then the presets it lacks, in the settings' order; the No section name is none of them. */
	private sectionChoice(list: GroupedList, item: TaskItem): SectionChoice {
		const { presets, ungrouped } = this.settings.groups;
		const tasks = [...(this.data.day?.list ?? []), ...this.data.soon, ...this.data.inbox].filter((task) => task.key.section === list);
		const names = [...tasks.flatMap((task) => (task.group === null ? [] : [task.group])), ...presets.map((preset) => preset.trim())];
		return { names: [...new Set(names)].filter((name) => name !== "" && name !== ungrouped), current: item.group, ungrouped };
	}

	private listOf(column: ListColumn): TaskList | null {
		return { left: this.list, soon: this.soonList, inbox: this.inboxList }[column];
	}

	/** The lists leave out the card waiting for its section's name; its own list draws it last. */
	private unnamed(items: readonly TaskItem[]): readonly TaskItem[] {
		const naming = this.naming;
		if (!naming) return items;
		return items.filter((item) => item.key.section !== naming.item.key.section || item.key.index !== naming.item.key.index);
	}

	private namingIn(column: ListColumn): TaskItem | null {
		return this.naming?.asked.column === column ? this.naming.item : null;
	}

	private showSources(anchor: HTMLElement): void {
		SourcesPopover.open({ anchor, statuses: this.data.statuses, now: this.deps.clock.now(), onRefresh: () => this.refreshNow() });
	}

	private refreshNow(): Promise<void> {
		this.deps.exportWorkCalendar();
		return this.polling.refresh();
	}

	/** Descriptions are drawn and edited by Obsidian itself, their links made from the tasks file. */
	private readonly markdown = new ObsidianMarkdown(this.app, this, () => this.settings.tasksFile, (link) => this.openLink(link));

	/** A task's description on its own screen: to read, or straight in the editor. */
	private descriptionSheet(item: TaskItem, editing: boolean): void {
		DescriptionSheet.open(this.contentEl, {
			title: item.text,
			markdown: item.description,
			editing,
			surface: this.markdown,
			onSave: (markdown) => this.act(() => this.deps.tasks.setDescription(item.key, markdown)),
		});
	}

	/** The task menu; a list card's offers the sections of its list too. */
	private showMenu(item: TaskItem, source: HTMLElement, lifted?: (copy: HTMLElement, close: () => void) => void): TaskMenu {
		const tasks = this.deps.tasks;
		const home = this.sectionsHome(item, source);
		const toSection = (name: GroupName) => {
			if (!home) return Promise.resolve();
			const date = home.date ?? undefined;
			return name === null ? tasks.moveToGroup(item.key, home.list, null, null, date) : tasks.createGroup(item.key, home.list, name, date);
		};
		return TaskMenu.open({
			item,
			source,
			lifted,
			sections: home ? this.sectionChoice(home.list, item) : undefined,
			onSubtask: (subtask, card) => this.showMenu(subtask, card),
			markdown: this.markdown,
			today: this.today(),
			day: this.selectedDate,
			levels: usableLevels(this.settings.priorities),
			actions: {
				setStatus: (status) => this.act(() => tasks.setStatus(item.key, status)),
				postpone: (date) => this.act(() => tasks.postpone(item.key, date)),
				removeDue: () => this.act(() => tasks.setDueDate(item.key, null)),
				toSection: (name) => this.act(() => toSection(name)),
				newSection: () => {
					if (home) this.askGroupName(item, home);
				},
				setPriority: (prefix) => this.act(() => tasks.setPriority(item.key, prefix)),
				rename: (menu) => this.quick?.rename(item, menu),
				openDescription: (editing) => this.descriptionSheet(item, editing),
				addSubtask: (menu) => this.quick?.addSubtask(item, menu),
				remove: () => this.act(() => tasks.remove(item.key)),
				openInObsidian: () => void this.openInObsidian(item),
				openLink: (link) => this.openLink(link),
			},
		});
	}

	/** The tasks file opens in a new tab, as a link does, the cursor at the start of the task's line and the line in the middle. */
	private async openInObsidian(item: TaskItem): Promise<void> {
		let line = 0;
		try {
			line = await this.deps.tasks.lineOf(item.key);
		} catch (error) {
			this.reportFailure(error);
			return;
		}
		const file = this.app.vault.getFileByPath(this.settings.tasksFile);
		if (!file) return;
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file, { active: true, state: { mode: "source" }, eState: { line } });
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const at = { line, ch: 0 };
		view.editor.setCursor(at);
		view.editor.scrollIntoView({ from: at, to: at }, true);
		view.editor.focus();
	}

	/** A note opens in a new tab, so the calendar stays where it is; an address goes to the browser. */
	private openLink(link: TaskLink): void {
		if (link.kind === "url") window.open(link.target);
		else void this.app.workspace.openLinkText(link.target, this.settings.tasksFile, "tab");
	}

	/** The whole screen anew. A gesture keeps the elements it holds: the redraw waits until it ends. */
	render(): void {
		this.parts.request("frame", "tasks", "events");
	}

	/**
	 * The frame: the columns' width and which pair shows, the headers. The tasks: the lists, the missing file's box, the
	 * timeline. The events: the all-day rows, the timeline. The switch's dot follows the sources, which a missing file hides.
	 */
	private draw(parts: ReadonlySet<ScreenPart>): void {
		const root = this.contentEl;
		if (!this.headers || !this.switcher || !this.leftEl || !this.soonEl || !this.inboxEl || !this.rightEl || !this.allDayEl || !this.timeline || !this.newTask || !this.newSoon || !this.newInbox || !this.list || !this.soonList || !this.inboxList) return;
		if (parts.has("frame")) {
			this.fitListWidth();
			this.headers.render();
			this.showMode(this.settings.rightMode);
		}
		this.switcher.render();
		if (parts.has("tasks")) {
			this.bulk.selection.forgetDrawn();
			this.list.render();
			const missing = this.data.missing;
			root.classList.toggle("is-missing", missing);
			for (const part of [this.leftEl, this.soonEl, this.inboxEl, this.rightEl, this.newTask.el, this.newSoon.el, this.newInbox.el]) part.style.display = missing ? "none" : "";
			root.querySelector(".tc-missing")?.remove();
			if (missing) this.renderMissing(root);
			this.soonList.render();
			this.inboxList.render();
		}
		if (parts.has("events")) renderAllDayRows(this.allDayEl, this.rightEl, this.data.events.filter((e) => e.allDay), this.theme());
		if (parts.has("tasks") || parts.has("events")) this.timeline.render();
		if (parts.has("tasks") && this.scrolledFor !== this.selectedDate) {
			this.scrolledFor = this.selectedDate;
			const boundary = this.boundary();
			if (this.selectedDate === this.today()) this.timeline.scrollTo(boundary.offsetOf(this.selectedDate, this.deps.clock.now()), LAYOUT.nowFraction);
			else this.timeline.scrollTo(boundary.offsetOfHour(this.settings.scrollToHour), 0);
		}
		this.quick?.rendered();
	}

	private renderMissing(root: HTMLElement): void {
		const box = el(root, "div", "tc-missing");
		el(box, "div", "", `No tasks file at ${this.settings.tasksFile}`);
		const button = el(box, "button", "tc-missing-btn", "Create file");
		button.addEventListener("click", () => void this.act(() => this.deps.tasks.createFile()));
	}

}

/** The top of the buttons of Obsidian's toolbar over the phone keyboard while it shows; null otherwise. */
function keyboardToolbarTop(doc: Document): number | null {
	const toolbar = doc.body.querySelector<HTMLElement>(".mobile-toolbar .mobile-toolbar-options-container");
	const box = toolbar?.getBoundingClientRect();
	return box && box.height > 0 ? box.top : null;
}

/** The top of Obsidian's desktop status bar while it shows; Infinity on the phone or while it is hidden. */
function statusBarTop(doc: Document): number {
	const bar = doc.body.querySelector<HTMLElement>(":scope > .app-container > .status-bar");
	const box = bar?.getBoundingClientRect();
	return box && box.height > 0 ? box.top : Infinity;
}

import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { type CalendarService, DayBoundary, type GroupedList, StaleTaskError, type TaskItem, type TaskKey, type TaskService } from "../application/contracts";
import type { Clock, SettingsStore } from "../application/ports";
import { LIST_WIDTH_MIN, type PriorityLevel, type RightMode, sameLevels, usableLevels, type ZoomLevel } from "../settings";
import { renderAllDayRows } from "./AllDayRow";
import { CalendarPolling } from "./CalendarPolling";
import type { Theme } from "./eventColors";
import { addDays } from "./dates";
import { DayData } from "./DayData";
import { ColumnHeaders } from "./ColumnHeaders";
import { ColumnSwitch } from "./ColumnSwitch";
import { DragController, type NameGroup } from "./drag/DragController";
import { ListDrop } from "./drag/ListDrop";
import { sameTask } from "./drag/listPlace";
import type { ColumnSections, DropTarget, ListColumn, PlacedResult, TaskDragPayload } from "./drag/DropTarget";
import { GroupDrag } from "./drag/GroupDrag";
import { GroupZones } from "./drag/GroupZones";
import { GroupMenu } from "./menu/GroupMenu";
import type { ListGroup } from "./listGroups";
import { PostponeZones } from "./drag/PostponeZones";
import { GroupNameField } from "./GroupNameField";
import { TimelineDrop } from "./drag/TimelineDrop";
import { GestureArbiter } from "./gestures";
import { detectHaptics, type HapticsHost } from "./haptics";
import { TaskMenu } from "./menu/TaskMenu";
import { QuickEntryController } from "./quick/QuickEntryController";
import { PullToRefresh } from "./sources/PullToRefresh";
import { SourcesPopover } from "./sources/SourcesPopover";
import { levelsFor, nearestLevel, stepFor } from "./zoomLevels";
import { dayTitle } from "./dayTitle";
import { DESIGN, DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import { Divider } from "./Divider";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "./listWidth";
import { clear, el, px } from "./dom";
import { NewTaskButton } from "./NewTaskButton";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { type Shift, stepScreen } from "./screens";
import { Swipe } from "./Swipe";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate } from "./types";

export const VIEW_TYPE = "task-calendar";
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
/** The gesture that holds the screen while a new section's name is typed: no redraw takes the field away. */
const NAMING = "naming";

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
	readonly calendars: CalendarService;
	readonly settings: SettingsStore;
	readonly clock: Clock;
	/** Asks the phone for fresh work calendar events; a refresh the user asks for runs it before reading the sources. */
	exportWorkCalendar(): void;
}

/**
 * The screen: a window two columns wide on a strip of four, Inbox, Soon, the list of the day (Now) and the day's timeline,
 * each list under its header. The window shows Inbox and Soon or Soon and Now, halved by a fixed divider, or Now and the
 * timeline, parted by the divider that sets the list's width; the switch at the bottom slides the strip, headers and all.
 */
export class TaskCalendarView extends ItemView {
	private selectedDate: LocalDate;
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
	private readonly polling: CalendarPolling;
	private renderPending = false;
	private scrolledFor: LocalDate | null = null;
	private dayStartHour: number;
	/** The levels the tasks were last read with: other levels colour them anew. */
	private priorities: readonly PriorityLevel[];
	private readonly arbiter = new GestureArbiter();
	private readonly haptics = detectHaptics(window as unknown as HapticsHost);
	private readonly drag: DragController;
	private leftDrop: ListDrop | null = null;
	private timelineDrop: TimelineDrop | null = null;
	private zoomFrame = 0;
	/** The pinch settled on the whole day: it keeps fitting as the timeline's height changes. */
	private wholeDay = false;
	private pull: PullToRefresh | null = null;
	private newTask: NewTaskButton | null = null;
	private newSoon: NewTaskButton | null = null;
	private newInbox: NewTaskButton | null = null;
	private postponeZones: PostponeZones | null = null;
	private groupZones: GroupZones[] = [];
	private readonly groupDrag: GroupDrag;
	/** A card dropped on New section, waiting at the end of its list for the section's name. */
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
		this.data = new DayData({ tasks: deps.tasks, calendars: deps.calendars, date: () => this.selectedDate, onUpdate: () => this.render() });
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
		this.drag = new DragController({
			longPressMs: () => this.settings.longPressMs,
			day: () => this.selectedDate,
			step: () => stepFor(this.hourPx),
			timeline: () => this.timeline,
			targets: () => this.dropTargets(),
			haptics: this.haptics,
			arbiter: this.arbiter,
			onDragging: (active) => {
				this.quick?.onDragging(active);
				if (active) {
					this.postponeZones?.show();
					for (const zones of this.groupZones) zones.show();
				}
				this.contentEl.classList.toggle("is-dragging", active);
			},
			onResult: (drag, result) => this.applyDrop(drag, result),
			onPickDate: (item, source) => this.showMenu(item, source, undefined, "picker"),
			onNameGroup: (item, asked) => this.askGroupName(item, asked),
			onResize: (item, slot) => this.act(() => this.deps.tasks.setSlot(item.key, slot)),
			onMenu: (item, source, lifted) => this.showMenu(item, source, lifted),
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
			onRelease: (width) => void this.deps.settings.update({ listShare: listShareOf(width, root.clientWidth) }).then(() => this.render()),
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
			onGrip: (block, item, edge, e) => this.drag.grip(block, item, edge, e),
		});
		el(this.rightEl, "div", "tc-fade");
		this.timelineDrop = new TimelineDrop(this.timeline, { step: () => stepFor(this.hourPx) });
		this.drag.attachCanvas(this.timeline.canvas);
		const timeline = this.timeline;
		this.pull = new PullToRefresh(timeline.el, {
			column: this.rightEl,
			arbiter: this.arbiter,
			statuses: () => this.data.statuses,
			now: () => this.deps.clock.now(),
			onRefresh: () => this.refreshNow(),
		});
		new PinchZoom(timeline.el, {
			hourPx: () => this.hourPx,
			min: () => this.zoomLevels()[0].hourPx,
			max: () => this.zoomLevels()[this.zoomLevels().length - 1].hourPx,
			arbiter: this.arbiter,
			minutesAt: (y) => timeline.minutesAt(y),
			onScale: (hourPx, anchor) => this.zoom(hourPx, anchor),
			onRelease: (hourPx, anchor) => this.settleZoom(hourPx, anchor),
		});
		this.newTask = new NewTaskButton(root, "now", () => this.quick?.openAtEnd("left"));
		this.newSoon = new NewTaskButton(root, "soon", () => this.quick?.openAtEnd("soon"));
		this.newInbox = new NewTaskButton(root, "inbox", () => this.quick?.openAtEnd("inbox"));
		this.newTask.pressOnDoubleClick(this.leftEl, this.list.el);
		this.newSoon.pressOnDoubleClick(this.soonEl, this.soonList.el);
		this.newInbox.pressOnDoubleClick(this.inboxEl, this.inboxList.el);
		const sections = (items: () => readonly TaskItem[]) => () => items().flatMap((item) => (item.group === null ? [] : [item.group]));
		this.groupZones = [
			new GroupZones(this.newTask.el, "left", { presets: () => this.settings.groups.presets, present: sections(() => this.data.day?.list ?? []), sections: () => this.sectionsOf("left") }),
			new GroupZones(this.newSoon.el, "soon", { presets: () => this.settings.groups.presets, present: sections(() => this.data.soon), sections: () => this.sectionsOf("soon") }),
			new GroupZones(this.newInbox.el, "inbox", { presets: () => this.settings.groups.presets, present: sections(() => this.data.inbox), sections: () => this.sectionsOf("inbox") }),
		];
		this.postponeZones = new PostponeZones(this.newTask.el, () => this.today(), () => this.selectedDate);
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
		new Swipe(root, {
			arbiter: this.arbiter,
			accepts: (target) => !(target instanceof Element && target.closest(".tc-quick-row, .tc-quick-bar")),
			onSwipe: (shift) => void this.afterEntry(() => this.step(shift)),
		});
		this.unsubscribe.push(
			this.deps.tasks.onChange(() => void this.data.tasks()),
			this.deps.calendars.onChange(() => void this.data.calendars()),
			this.deps.settings.onChange(() => this.onSettings()),
		);
		this.registerDomEvent(window, "focus", () => void this.polling.refresh());
		this.registerDomEvent(document, "visibilitychange", () => {
			if (!document.hidden) void this.polling.refresh();
		});
		this.registerDomEvent(root, "touchmove", (e) => {
			if (this.arbiter.busy || e.touches.length > 1) e.preventDefault();
			e.stopPropagation();
		}, { passive: false });
		for (const type of ["touchstart", "touchend", "touchcancel"] as const) this.registerDomEvent(root, type, (e) => e.stopPropagation(), { passive: true });
		this.registerDomEvent(document, "pointerdown", (e) => this.deselectUnless(e.target), { capture: true });
		this.arbiter.onIdle(() => this.renderPending && this.render());
		this.registerEvent(this.app.workspace.on("css-change", () => this.render()));
		this.registerInterval(window.setInterval(() => void this.tick(), MINUTE_MS));
		requestAnimationFrame(() => this.measureNavigation());
		this.polling.start();
		await this.data.load();
	}

	/** Once a minute: the now line moves, and a day that ended releases its slots (the file is written only when a rule fires). */
	private async tick(): Promise<void> {
		this.render();
		await this.deps.tasks.normalize();
	}

	override async onClose(): Promise<void> {
		this.quick?.close();
		this.polling.stop();
		this.unsubscribe.splice(0).forEach((off) => off());
	}

	override onResize(): void {
		this.measureNavigation();
		this.fitListWidth();
		this.quick?.reveal();
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

	/** Obsidian's phone navigation floats over the content; what is pinned to the bottom stays above it. */
	private measureNavigation(): void {
		const nav = document.querySelector(".mobile-navbar");
		const root = this.contentEl.getBoundingClientRect();
		const clear = nav ? Math.max(0, root.bottom - nav.getBoundingClientRect().top) : 0;
		this.contentEl.style.setProperty(PROPERTY.navClear, px(nav && nav.getBoundingClientRect().height > 0 ? clear : 0));
	}

	/**
	 * Every switch of what the screen shows, another day or another pair of columns, waits for the entry to settle: the
	 * text typed is written for the day and the place it was typed at, before the lists change under it.
	 */
	private async afterEntry(change: () => void | Promise<void>): Promise<void> {
		await this.quick?.settle();
		await change();
	}

	private select(date: LocalDate): void {
		this.selectedDate = date;
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
	 * The strip slides only while the window moves to the other pair, in step with the switch's pill, before the choice is
	 * saved; the divider's drag and a resize move it at once.
	 */
	private async setMode(mode: RightMode): Promise<void> {
		const root = this.contentEl;
		window.clearTimeout(this.switching);
		root.classList.add("is-switching");
		this.switching = window.setTimeout(() => root.classList.remove("is-switching"), tokenMs(root, DURATION.slide));
		this.showMode(mode);
		await this.deps.settings.update({ rightMode: mode });
		this.render();
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

	/** Released, the scale glides to the nearest level, and the timeline opens at it next time. */
	private settleZoom(from: number, anchor: ZoomAnchor): void {
		const levels = this.zoomLevels();
		const to = nearestLevel(from, levels).hourPx;
		this.wholeDay = to === levels[0].hourPx;
		const started = performance.now();
		const frame = (now: number) => {
			const t = Math.min(1, (now - started) / LAYOUT.zoomSnapMs);
			const eased = 1 - (1 - t) * (1 - t);
			this.hourPx = from + (to - from) * eased;
			this.timeline?.zoomTo(anchor.minutes, anchor.clientY);
			this.zoomFrame = t < 1 ? requestAnimationFrame(frame) : 0;
			if (t === 1) void this.deps.settings.update({ zoom: this.wholeDay ? "wholeDay" : to });
		};
		this.zoomFrame = requestAnimationFrame(frame);
	}

	/** The zones that put a task off, under the Today column, then the two columns the window shows. */
	private dropTargets(): DropTarget[] {
		return [...this.groupZones.flatMap((zones) => zones.targets), ...(this.postponeZones?.targets ?? []), ...this.shownDrops()];
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

	/** A list's card: its gestures, and hidden while the field renames it. */
	private attachCard(card: HTMLElement, item: TaskItem, column: ListColumn, subtree: readonly HTMLElement[]): void {
		this.drag.attachCard(card, item, column, subtree);
		this.quick?.dress(card, item);
	}

	/** What a drop means for the file: the table in spec §5.1. */
	private applyDrop(drag: TaskDragPayload, result: PlacedResult): Promise<void> {
		const key = drag.item.key;
		const tasks = this.deps.tasks;
		return this.act(() => {
			if (result.kind === "slot") return tasks.setSlot(key, result.slot);
			if (result.kind === "clearSlot") return tasks.clearSlot(key);
			if (result.kind === "postpone") return tasks.postpone(key, result.date);
			if (result.kind === "group") return tasks.moveToGroup(key, result.list, result.group, result.before, result.date ?? undefined);
			if (result.kind === "newGroup") return tasks.createGroup(key, result.list, result.name, result.date ?? undefined);
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
			select: false,
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

	/** The name is edited where the header stands, selected to be typed over. */
	private renameInPlace(head: HTMLElement, list: GroupedList, name: string): void {
		if (!this.arbiter.claim(NAMING)) return;
		const slot = el(null, "div", "tc-group-slot");
		head.before(slot);
		head.classList.add("is-renamed");
		GroupNameField.open(slot, {
			value: name,
			select: true,
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
		const today = this.today();
		if (this.selectedDate === today) return { list: "now", date: null };
		return this.selectedDate > today ? { list: "soon", date: this.selectedDate } : null;
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

	/** The task menu; opened on its picker, a chosen day puts the task off as Tomorrow does. */
	private showMenu(item: TaskItem, source: HTMLElement, lifted?: (copy: HTMLElement, close: () => void) => void, opening?: "picker"): TaskMenu {
		const tasks = this.deps.tasks;
		const setDueDate = (date: LocalDate | null) => (opening === "picker" && date !== null ? tasks.postpone(item.key, date) : tasks.setDueDate(item.key, date));
		return TaskMenu.open({
			item,
			source,
			lifted,
			opening,
			onSubtask: (subtask, card) => this.showMenu(subtask, card),
			today: this.today(),
			day: this.selectedDate,
			levels: usableLevels(this.settings.priorities),
			actions: {
				setStatus: (status) => this.act(() => tasks.setStatus(item.key, status)),
				setDueDate: (date) => this.act(() => setDueDate(date)),
				setPriority: (prefix) => this.act(() => tasks.setPriority(item.key, prefix)),
				rename: (menu) => this.quick?.rename(item, menu),
				addSubtask: (menu) => this.quick?.addSubtask(item, menu),
				remove: () => this.act(() => tasks.remove(item.key)),
			},
		});
	}

	/** A gesture keeps the elements it holds: the redraw waits until it ends. */
	render(): void {
		if (this.arbiter.busy) {
			this.renderPending = true;
			return;
		}
		this.renderPending = false;
		const root = this.contentEl;
		if (!this.headers || !this.switcher || !this.leftEl || !this.soonEl || !this.inboxEl || !this.rightEl || !this.allDayEl || !this.timeline || !this.newTask || !this.newSoon || !this.newInbox || !this.list || !this.soonList || !this.inboxList) return;
		this.fitListWidth();
		this.headers.render();
		this.switcher.render();
		this.list.render();
		const missing = this.data.missing;
		root.classList.toggle("is-missing", missing);
		this.showMode(this.settings.rightMode);
		for (const part of [this.leftEl, this.soonEl, this.inboxEl, this.rightEl, this.newTask.el, this.newSoon.el, this.newInbox.el]) part.style.display = missing ? "none" : "";
		root.querySelector(".tc-missing")?.remove();
		if (missing) this.renderMissing(root);
		this.soonList.render();
		this.inboxList.render();
		this.pull?.renderArea();
		renderAllDayRows(this.allDayEl, this.rightEl, this.data.events.filter((e) => e.allDay), this.theme());
		this.timeline.render();
		if (this.scrolledFor !== this.selectedDate) {
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

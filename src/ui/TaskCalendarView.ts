import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { type CalendarService, DayBoundary, type Placement, StaleTaskError, type TaskItem, type TaskService } from "../application/contracts";
import type { Clock, SettingsStore } from "../application/ports";
import { LIST_WIDTH_MIN, type PriorityLevel, type RightMode, sameLevels, usableLevels } from "../settings";
import { renderAllDayRows } from "./AllDayRow";
import { CalendarPolling } from "./CalendarPolling";
import type { Theme } from "./eventColors";
import { addDays } from "./dates";
import { DayData } from "./DayData";
import { DayHeader } from "./DayHeader";
import { DragController } from "./drag/DragController";
import { ListDrop } from "./drag/ListDrop";
import type { DragPayload, DropTarget, PlacedResult } from "./drag/DropTarget";
import { PostponeZones } from "./drag/PostponeZones";
import { TimelineDrop } from "./drag/TimelineDrop";
import { GestureArbiter } from "./gestures";
import { detectHaptics, type HapticsHost } from "./haptics";
import { TaskMenu } from "./menu/TaskMenu";
import { TaskSheet } from "./sheet/TaskSheet";
import { PullToRefresh } from "./sources/PullToRefresh";
import { SourcesPopover } from "./sources/SourcesPopover";
import { nearestLevel, stepFor } from "./zoomLevels";
import { dayTitle } from "./dayTitle";
import { DESIGN, DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import { Divider } from "./Divider";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "./listWidth";
import { clear, el, px } from "./dom";
import { NewTaskButton } from "./NewTaskButton";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate, Slot } from "./types";

export const VIEW_TYPE = "task-calendar";
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;

export interface ViewDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly settings: SettingsStore;
	readonly clock: Clock;
	/** Asks the phone for fresh work calendar events; a refresh the user asks for runs it before reading the sources. */
	exportWorkCalendar(): void;
}

/**
 * The screen: the day row over a window two columns wide on a strip of four, Inbox, Soon, the list of the day (Now) and
 * the day's timeline. The window shows Inbox and Soon or Soon and Now, halved by a fixed divider, or Now and the timeline,
 * parted by the divider that sets the list's width; switching slides the strip.
 */
export class TaskCalendarView extends ItemView {
	private selectedDate: LocalDate;
	private header: DayHeader | null = null;
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
	private pull: PullToRefresh | null = null;
	private newTask: NewTaskButton | null = null;
	private newSoon: NewTaskButton | null = null;
	private newInbox: NewTaskButton | null = null;
	private postponeZones: PostponeZones | null = null;
	private switching = 0;
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
		this.drag = new DragController({
			longPressMs: () => this.settings.longPressMs,
			step: () => stepFor(this.hourPx),
			timeline: () => this.timeline,
			targets: () => this.dropTargets(),
			haptics: this.haptics,
			arbiter: this.arbiter,
			onDragging: (active) => this.contentEl.classList.toggle("is-dragging", active),
			onResult: (drag, result) => this.applyDrop(drag, result),
			onPickDate: (item, source) => this.showMenu(item, source, undefined, "picker"),
			onResize: (item, slot) => this.act(() => this.deps.tasks.setSlot(item.key, slot)),
			onMenu: (item, source, lifted) => this.showMenu(item, source, lifted),
			newSlot: () => this.timelineDrop,
			onNewSlot: (slot) => this.newTaskSheet(this.selectedDate === this.today() ? { kind: "now" } : { kind: "date", date: this.selectedDate }, slot),
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
		this.fitListWidth();
		this.header = new DayHeader(root, {
			title: () => dayTitle(this.selectedDate, this.today()),
			onStep: (days) => this.select(addDays(this.selectedDate, days)),
			onToday: () => this.select(this.today()),
			mode: () => this.settings.rightMode,
			onMode: (mode) => void this.setMode(mode),
			dot: () => this.data.statuses.some((s) => s.stale),
			onSources: (anchor) => this.showSources(anchor),
			longPressMs: () => this.settings.longPressMs,
		});
		this.leftEl = el(root, "div", "tc-left");
		this.list = new TaskList(el(this.leftEl, "div"), {
			items: () => this.data.day?.list ?? [],
			showDue: () => true,
			onCard: (card, item) => this.drag.attachCard(card, item, "left"),
		});
		this.leftDrop = new ListDrop(this.list, this.leftEl, "left", () => true);
		this.inboxEl = el(root, "div", "tc-inbox");
		this.inboxList = new TaskList(el(this.inboxEl, "div"), {
			items: () => this.data.inbox,
			showDue: () => false,
			onCard: (card, item) => this.drag.attachCard(card, item, "inbox"),
		});
		this.inboxDrop = new ListDrop(this.inboxList, this.inboxEl, "inbox", (drag) => drag.from === "inbox" || drag.from === "soon");
		this.soonEl = el(root, "div", "tc-soon");
		this.soonList = new TaskList(el(this.soonEl, "div"), {
			items: () => this.data.soon,
			showDue: () => false,
			onCard: (card, item) => this.drag.attachCard(card, item, "soon"),
		});
		this.soonDrop = new ListDrop(this.soonList, this.soonEl, "soon", (drag) => drag.from !== "timeline");
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
			onBlock: (block, item) => this.drag.attachBlock(block, item),
			onGrip: (block, item, edge, e) => this.drag.grip(block, item, edge, e),
		});
		el(this.rightEl, "div", "tc-fade");
		this.timelineDrop = new TimelineDrop(this.timeline, { step: () => stepFor(this.hourPx), floor: () => this.postponeZones?.top() ?? null });
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
			min: Math.min(...this.settings.zoomLevels.map((l) => l.hourPx)),
			max: Math.max(...this.settings.zoomLevels.map((l) => l.hourPx)),
			arbiter: this.arbiter,
			minutesAt: (y) => timeline.minutesAt(y),
			onScale: (hourPx, anchor) => this.zoom(hourPx, anchor),
			onRelease: (hourPx, anchor) => this.settleZoom(hourPx, anchor),
		});
		this.newTask = new NewTaskButton(root, "now", () => this.newTaskSheet(this.selectedDate === this.today() ? { kind: "now" } : { kind: "date", date: this.selectedDate }, null));
		this.newSoon = new NewTaskButton(root, "soon", () => this.newTaskSheet({ kind: "soon" }, null));
		this.newInbox = new NewTaskButton(root, "inbox", () => this.newTaskSheet({ kind: "inbox" }, null));
		this.postponeZones = new PostponeZones(root, () => this.today());
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
		this.polling.stop();
		this.unsubscribe.splice(0).forEach((off) => off());
	}

	override onResize(): void {
		this.measureNavigation();
		this.fitListWidth();
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

	/** Another hour for the day's start moves today and the timeline: the screen opens today afresh. */
	private onSettings(): void {
		if (!sameLevels(this.settings.priorities, this.priorities)) {
			this.priorities = this.settings.priorities;
			void this.data.tasks();
		}
		if (this.settings.dayStartHour === this.dayStartHour) return;
		this.dayStartHour = this.settings.dayStartHour;
		this.scrolledFor = null;
		this.select(this.today());
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

	private select(date: LocalDate): void {
		this.selectedDate = date;
		void this.data.selectDay();
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

	/** Each finger reports its moves on its own; the timeline is laid out once per frame for the latest scale. */
	private zoom(hourPx: number, anchor: ZoomAnchor): void {
		if (this.zoomFrame) cancelAnimationFrame(this.zoomFrame);
		this.zoomFrame = requestAnimationFrame(() => {
			this.zoomFrame = 0;
			this.hourPx = hourPx;
			this.timeline?.zoomTo(anchor.minutes, anchor.clientY);
		});
	}

	/** Released, the scale glides to the nearest level. */
	private settleZoom(from: number, anchor: ZoomAnchor): void {
		const to = nearestLevel(from, this.settings.zoomLevels).hourPx;
		const started = performance.now();
		const frame = (now: number) => {
			const t = Math.min(1, (now - started) / LAYOUT.zoomSnapMs);
			const eased = 1 - (1 - t) * (1 - t);
			this.hourPx = from + (to - from) * eased;
			this.timeline?.zoomTo(anchor.minutes, anchor.clientY);
			this.zoomFrame = t < 1 ? requestAnimationFrame(frame) : 0;
		};
		this.zoomFrame = requestAnimationFrame(frame);
	}

	/** The bar that puts a task off, over the bottom of the screen, then the two columns the window shows. */
	private dropTargets(): DropTarget[] {
		const shown: Record<RightMode, (DropTarget | null)[]> = {
			calendar: [this.timelineDrop, this.leftDrop],
			soon: [this.soonDrop, this.leftDrop],
			inbox: [this.inboxDrop, this.soonDrop],
		};
		const columns = shown[this.settings.rightMode].filter((target): target is DropTarget => target !== null);
		return [...(this.postponeZones?.targets ?? []), ...columns];
	}

	/** What a drop means for the file: the table in spec §5.1. */
	private applyDrop(drag: DragPayload, result: PlacedResult): Promise<void> {
		const key = drag.item.key;
		const tasks = this.deps.tasks;
		return this.act(() => {
			if (result.kind === "slot") return tasks.setSlot(key, result.slot);
			if (result.kind === "clearSlot") return tasks.clearSlot(key);
			if (result.kind === "postpone") return tasks.postpone(key, result.date);
			if (drag.from === "timeline") return tasks.clearSlot(key, { before: result.before, date: this.selectedDate });
			if (result.column === "left") return drag.from === "left" ? tasks.moveBefore(key, result.before, this.selectedDate) : tasks.moveToList(key, this.selectedDate);
			if (result.before) return tasks.moveBefore(key, result.before, this.selectedDate);
			if (drag.from === "left") return tasks.moveToSoon(key, this.selectedDate);
			return tasks.moveToEnd(key, result.column);
		});
	}

	private showSources(anchor: HTMLElement): void {
		SourcesPopover.open({ anchor, statuses: this.data.statuses, now: this.deps.clock.now(), onRefresh: () => this.refreshNow() });
	}

	private refreshNow(): Promise<void> {
		this.deps.exportWorkCalendar();
		return this.polling.refresh();
	}

	/** The task screen for a new task; with a slot, from a long tap on the timeline. */
	newTaskSheet(placement: Placement, slot: Slot | null): void {
		TaskSheet.open(this.contentEl, {
			mode: "new",
			initial: { text: "", placement, priority: null },
			slot,
			today: this.today(),
			levels: usableLevels(this.settings.priorities),
			onSubmit: (draft) => this.act(() => this.deps.tasks.create(draft, slot ?? undefined)),
			onClose: () => this.timelineDrop?.clear(),
		});
	}

	private editSheet(item: TaskItem): void {
		TaskSheet.open(this.contentEl, {
			mode: "edit",
			initial: { text: item.text, placement: this.deps.tasks.placementOf(item), priority: item.priority?.prefix ?? null },
			slot: item.slot,
			today: this.today(),
			levels: usableLevels(this.settings.priorities),
			onSubmit: (draft) => this.act(() => this.deps.tasks.edit(item.key, draft)),
		});
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
			today: this.today(),
			levels: usableLevels(this.settings.priorities),
			actions: {
				setStatus: (status) => this.act(() => tasks.setStatus(item.key, status)),
				setDueDate: (date) => this.act(() => setDueDate(date)),
				setPriority: (prefix) => this.act(() => tasks.setPriority(item.key, prefix)),
				rename: () => this.editSheet(item),
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
		if (!this.header || !this.leftEl || !this.soonEl || !this.inboxEl || !this.rightEl || !this.allDayEl || !this.timeline || !this.newTask || !this.newSoon || !this.newInbox || !this.list || !this.soonList || !this.inboxList) return;
		this.fitListWidth();
		this.header.render();
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
	}

	private renderMissing(root: HTMLElement): void {
		const box = el(root, "div", "tc-missing");
		el(box, "div", "", `No tasks file at ${this.settings.tasksFile}`);
		const button = el(box, "button", "tc-missing-btn", "Create file");
		button.addEventListener("click", () => void this.act(() => this.deps.tasks.createFile()));
	}

}

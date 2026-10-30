import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { type CalendarService, type Placement, StaleTaskError, type TaskItem, type TaskService } from "../application/contracts";
import type { Clock, SettingsStore } from "../application/ports";
import { LIST_WIDTH_MAX, LIST_WIDTH_MIN, type RightMode } from "../settings";
import { renderAllDayRows } from "./AllDayRow";
import type { Theme } from "./eventColors";
import { addDays, localDateOf, minutesOf } from "./dates";
import { DayData } from "./DayData";
import { DayHeader } from "./DayHeader";
import { DragController } from "./drag/DragController";
import { ListDrop } from "./drag/ListDrop";
import type { DragPayload, DropResult, DropTarget } from "./drag/DropTarget";
import { TimelineDrop } from "./drag/TimelineDrop";
import { GestureArbiter } from "./gestures";
import { detectHaptics, type HapticsHost } from "./haptics";
import { TaskMenu } from "./menu/TaskMenu";
import { TaskSheet } from "./sheet/TaskSheet";
import { PullToRefresh } from "./sources/PullToRefresh";
import { SourcesPopover } from "./sources/SourcesPopover";
import { nearestLevel, stepFor } from "./zoomLevels";
import { dayTitle } from "./dayTitle";
import { DESIGN, LAYOUT, PROPERTY } from "./design";
import { Divider } from "./Divider";
import { clear, el, px } from "./dom";
import { NewTaskButton } from "./NewTaskButton";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate, Slot } from "./types";

export const VIEW_TYPE = "task-calendar";
const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;

export interface ViewDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly settings: SettingsStore;
	readonly clock: Clock;
}

/** The screen: the day row, the list of the day on the left, the day's timeline or the Soon list on the right. */
export class TaskCalendarView extends ItemView {
	private selectedDate: LocalDate;
	private header: DayHeader | null = null;
	private leftEl: HTMLElement | null = null;
	private list: TaskList | null = null;
	private soonList: TaskList | null = null;
	private soonDrop: ListDrop | null = null;
	private rightEl: HTMLElement | null = null;
	private allDayEl: HTMLElement | null = null;
	private timeline: Timeline | null = null;
	private hourPx: number = DESIGN.hourPx;
	private readonly data: DayData;
	private renderPending = false;
	private scrolledFor: LocalDate | null = null;
	private readonly arbiter = new GestureArbiter();
	private readonly drag: DragController;
	private leftDrop: ListDrop | null = null;
	private timelineDrop: TimelineDrop | null = null;
	private zoomFrame = 0;
	private pull: PullToRefresh | null = null;
	private newTask: NewTaskButton | null = null;
	private newSoon: NewTaskButton | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: ViewDeps,
	) {
		super(leaf);
		this.selectedDate = this.today();
		this.data = new DayData({ tasks: deps.tasks, calendars: deps.calendars, date: () => this.selectedDate, onUpdate: () => this.render() });
		this.drag = new DragController({
			longPressMs: () => this.settings.longPressMs,
			newTaskMinutes: () => this.settings.newTaskMinutes,
			step: () => stepFor(this.hourPx, this.settings.zoomLevels),
			date: () => this.selectedDate,
			timeline: () => this.timeline,
			targets: () => this.dropTargets(),
			haptics: detectHaptics(window as unknown as HapticsHost),
			arbiter: this.arbiter,
			onResult: (drag, result) => this.applyDrop(drag, result),
			onResize: (item, end) => this.act(() => this.deps.tasks.setSlot(item.key, { ...item.slot!, end })),
			onMenu: (item, source) => this.showMenu(item, source),
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
		root.style.setProperty(PROPERTY.listWidth, px(this.settings.listWidth));
		this.header = new DayHeader(root, {
			title: () => dayTitle(this.selectedDate, this.today()),
			onStep: (days) => this.select(addDays(this.selectedDate, days)),
			onToday: () => this.select(this.today()),
			mode: () => this.settings.rightMode,
			onMode: (mode) => void this.setMode(mode),
			dot: () => this.data.statuses.some((s) => s.stale),
			onSources: (anchor) => this.showSources(anchor),
		});
		this.leftEl = el(root, "div", "tc-left");
		this.list = new TaskList(el(this.leftEl, "div"), {
			items: () => this.data.day?.list ?? [],
			showDue: () => true,
			onCard: (card, item) => this.drag.attachCard(card, item, "left"),
		});
		this.leftDrop = new ListDrop(this.list, this.leftEl, "left", () => true);
		new Divider(el(root, "div"), {
			width: () => this.settings.listWidth,
			onWidth: (width) => root.style.setProperty(PROPERTY.listWidth, px(width)),
			onRelease: (width) => void this.deps.settings.update({ listWidth: width }).then(() => this.render()),
			min: LIST_WIDTH_MIN,
			max: LIST_WIDTH_MAX,
		});
		this.rightEl = el(root, "div", "tc-right");
		this.soonList = new TaskList(el(this.rightEl, "div", "is-soon"), {
			items: () => this.data.soon,
			showDue: () => false,
			onCard: (card, item) => this.drag.attachCard(card, item, "soon"),
		});
		this.soonDrop = new ListDrop(this.soonList, this.rightEl, "soon", (drag) => drag.from !== "timeline");
		this.allDayEl = el(this.rightEl, "div");
		this.timeline = new Timeline(el(this.rightEl, "div"), {
			theme: () => this.theme(),
			date: () => this.selectedDate,
			today: () => this.today(),
			hourPx: () => this.hourPx,
			tasks: () => this.data.day?.slotted ?? [],
			events: () => this.data.events,
			now: () => this.deps.clock.now(),
			onBlock: (block, item) => this.drag.attachBlock(block, item),
		});
		this.timelineDrop = new TimelineDrop(this.timeline, { step: () => stepFor(this.hourPx, this.settings.zoomLevels), date: () => this.selectedDate });
		this.drag.attachCanvas(this.timeline.canvas);
		const timeline = this.timeline;
		this.pull = new PullToRefresh(timeline.el, {
			column: this.rightEl,
			arbiter: this.arbiter,
			statuses: () => this.data.statuses,
			now: () => this.deps.clock.now(),
			onRefresh: () => this.data.calendars(),
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
		this.newTask = new NewTaskButton(root, false, () => this.newTaskSheet(this.selectedDate === this.today() ? { kind: "now" } : { kind: "date", date: this.selectedDate }, null));
		this.newSoon = new NewTaskButton(root, true, () => this.newTaskSheet({ kind: "soon" }, null));
		this.unsubscribe = this.deps.tasks.onChange(() => void this.data.tasks());
		this.registerDomEvent(root, "touchmove", (e) => {
			if (this.arbiter.busy || e.touches.length > 1) e.preventDefault();
			e.stopPropagation();
		}, { passive: false });
		for (const type of ["touchstart", "touchend", "touchcancel"] as const) this.registerDomEvent(root, type, (e) => e.stopPropagation(), { passive: true });
		this.arbiter.onIdle(() => this.renderPending && this.render());
		this.registerEvent(this.app.workspace.on("css-change", () => this.render()));
		this.registerInterval(window.setInterval(() => void this.tick(), MINUTE_MS));
		requestAnimationFrame(() => this.measureNavigation());
		await this.data.load();
	}

	/** Once a minute: the now line moves, and a day that ended releases its slots (the file is written only when a rule fires). */
	private async tick(): Promise<void> {
		this.render();
		await this.deps.tasks.normalize();
	}

	override async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	override onResize(): void {
		this.measureNavigation();
	}

	private get settings() {
		return this.deps.settings.get();
	}

	private today(): LocalDate {
		return localDateOf(this.deps.clock.now());
	}

	/** The tokens follow Obsidian's theme by themselves; the event colours the code computes follow it here. */
	private theme(): Theme {
		return document.body.classList.contains("theme-light") ? "light" : "dark";
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

	private async setMode(mode: RightMode): Promise<void> {
		await this.deps.settings.update({ rightMode: mode });
		this.render();
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

	private dropTargets(): DropTarget[] {
		const targets: DropTarget[] = [];
		if (this.settings.rightMode === "calendar" && this.timelineDrop) targets.push(this.timelineDrop);
		if (this.settings.rightMode === "soon" && this.soonDrop) targets.push(this.soonDrop);
		if (this.leftDrop) targets.push(this.leftDrop);
		return targets;
	}

	/** What a drop means for the file: the table in spec §5.1. */
	private applyDrop(drag: DragPayload, result: DropResult): Promise<void> {
		const key = drag.item.key;
		const tasks = this.deps.tasks;
		return this.act(() => {
			if (result.kind === "slot") return tasks.setSlot(key, result.slot);
			if (result.kind === "clearSlot" || drag.from === "timeline") return tasks.clearSlot(key);
			if (drag.from === result.column) return tasks.moveBefore(key, result.before, this.selectedDate);
			return result.column === "left" ? tasks.moveToList(key, this.selectedDate) : tasks.moveToSoon(key, this.selectedDate);
		});
	}

	private showSources(anchor: HTMLElement): void {
		SourcesPopover.open({ anchor, statuses: this.data.statuses, now: this.deps.clock.now(), onRefresh: () => this.data.calendars() });
	}

	/** The task screen for a new task; with a slot, from a long tap on the timeline. */
	newTaskSheet(placement: Placement, slot: Slot | null): void {
		TaskSheet.open(this.contentEl, {
			mode: "new",
			initial: { text: "", placement },
			slot,
			today: this.today(),
			onSubmit: (draft) => this.act(() => this.deps.tasks.create(draft, slot ?? undefined)),
			onClose: () => this.timelineDrop?.clear(),
		});
	}

	private editSheet(item: TaskItem): void {
		TaskSheet.open(this.contentEl, {
			mode: "edit",
			initial: { text: item.text, placement: this.deps.tasks.placementOf(item) },
			slot: item.slot,
			today: this.today(),
			onSubmit: (draft) => this.act(() => this.deps.tasks.edit(item.key, draft)),
		});
	}

	private showMenu(item: TaskItem, source: HTMLElement): void {
		const tasks = this.deps.tasks;
		TaskMenu.open({
			item,
			source,
			today: this.today(),
			actions: {
				setStatus: (status) => this.act(() => tasks.setStatus(item.key, status)),
				setDueDate: (date) => this.act(() => tasks.setDueDate(item.key, date)),
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
		if (!this.header || !this.leftEl || !this.rightEl || !this.allDayEl || !this.timeline || !this.newTask || !this.newSoon || !this.list || !this.soonList) return;
		root.style.setProperty(PROPERTY.listWidth, px(this.settings.listWidth));
		this.header.render();
		this.list.render();
		const missing = this.data.missing;
		root.classList.toggle("is-missing", missing);
		const soon = this.settings.rightMode === "soon";
		this.newSoon.el.style.display = soon && !missing ? "" : "none";
		this.newTask.el.style.display = missing ? "none" : "";
		this.leftEl.style.display = missing ? "none" : "";
		this.rightEl.style.display = missing ? "none" : "";
		root.querySelector(".tc-missing")?.remove();
		if (missing) this.renderMissing(root);
		this.allDayEl.style.display = soon ? "none" : "";
		this.timeline.el.style.display = soon ? "none" : "";
		this.soonList.el.style.display = soon ? "" : "none";
		this.soonList.render();
		this.pull?.renderArea();
		renderAllDayRows(this.allDayEl, this.rightEl, this.data.events.filter((e) => e.allDay), this.theme());
		this.timeline.render();
		if (this.scrolledFor !== this.selectedDate) {
			this.scrolledFor = this.selectedDate;
			if (this.selectedDate === this.today()) this.timeline.scrollTo(minutesOf(this.deps.clock.now()), LAYOUT.nowFraction);
			else this.timeline.scrollTo(this.settings.scrollToHour * MINUTES_PER_HOUR, 0);
		}
	}

	private renderMissing(root: HTMLElement): void {
		const box = el(root, "div", "tc-missing");
		el(box, "div", "", `No tasks file at ${this.settings.tasksFile}`);
		const button = el(box, "button", "tc-missing-btn", "Create file");
		button.addEventListener("click", () => void this.act(() => this.deps.tasks.createFile()));
	}

}

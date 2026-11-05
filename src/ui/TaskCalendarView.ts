import { ItemView, MarkdownView, Notice, Platform, Scope, type WorkspaceLeaf } from "obsidian";
import { type CalendarEvent, type CalendarService, type DayBoundary, type DayChange, type DayService, type GroupedList, type GroupName, samePlace, sameTaskTree, StaleTaskError, type TaskItem, type TaskKey, type TaskService, type UndoService } from "../application/contracts";
import type { Clock, SettingsStore } from "../application/ports";
import { LIST_WIDTH_MIN, type RightMode, type TaskCalendarSettings, type ZoomLevel } from "../settings";
import { renderAllDayRows } from "./AllDayRow";
import { BottomCapsule } from "./BottomCapsule";
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
import type { ColumnSections, DragPayload, DropResult, ListColumn, TaskDragPayload } from "./drag/DropTarget";
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
import { ObsidianChrome } from "./quick/ObsidianChrome";
import { DescriptionSheet } from "./sheet/DescriptionSheet";
import type { TaskLink } from "./TaskTitle";
import { SourcesPopover } from "./sources/SourcesPopover";
import { levelsFor, stepFor } from "./zoomLevels";
import { dayTitle } from "./dayTitle";
import { DESIGN, DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import { Divider } from "./Divider";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "./listWidth";
import { clear, el, px } from "./dom";
import { Button } from "./kit/Button";
import { FreeRoomDoubleClick } from "./FreeRoomDoubleClick";
import { EntryTrace } from "./entryTrace";
import { Keyboard } from "./Keyboard";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { type ScreenPart, ScreenParts } from "./ScreenParts";
import { settingsEffect } from "./settingsEffect";
import { StatusBarRoom } from "./StatusBarRoom";
import { type Shift, stepScreen } from "./screens";
import { Swipe, swipeStartsAt } from "./Swipe";
import { DayPeek } from "./DayPeek";
import { ScreenPager, type ScreenTrack } from "./ScreenPager";
import { type DayLane, DayTrack, EdgeTrack, restore, StripTrack, stripParts } from "./ScreenTracks";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate } from "./types";

export const VIEW_TYPE = "task-calendar";

/** Inbox and Backlog take what waits to be sorted or put off: a card from either of them or from Soon, or the plus. */
const undatedTakes = (drag: DragPayload): boolean => drag.from === "inbox" || drag.from === "backlog" || drag.from === "soon" || drag.from === "new";
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
		if (samePlace(item.key, key)) return item;
		const inner = findTask(item.subtasks, key);
		if (inner) return inner;
	}
	return null;
}

export interface ViewDeps {
	readonly tasks: TaskService;
	/** Which day today is, where it begins, and when that changes. */
	readonly days: DayService;
	/** The plugin's own changes of the tasks file, taken back by the corner button and Cmd+Z. */
	readonly undo: UndoService;
	readonly calendars: CalendarService;
	readonly settings: SettingsStore;
	readonly clock: Clock;
	/** Asks the phone for fresh work calendar events; a refresh the user asks for runs it before reading the sources. */
	exportWorkCalendar(): void;
	/** Apple's Calendar at the event. */
	openInCalendar(event: CalendarEvent): void;
	/** Temporary: the note the quick entry trace is written to, for a phone with no console. */
	readonly entryLog: { append(text: string): void };
}

/**
 * The screen: a window two columns wide on a strip of four, Inbox over Backlog, Soon, the list of the day (Now) and the
 * day's timeline, each list under its header. The window shows Inbox and Soon or Soon and Now, halved by a fixed divider, or Now and the
 * timeline, parted by the divider that sets the list's width; the switch at the bottom slides the strip, headers and all.
 */
export class TaskCalendarView extends ItemView {
	private selectedDate: LocalDate;
	/** A minute passed while the view was hidden or a gesture held it: it ticks once as soon as it can. */
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
	private backlogList: TaskList | null = null;
	private backlogDrop: ListDrop | null = null;
	private backlogTitle: HTMLElement | null = null;
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
	/** The settings the screen last followed: a change is weighed against them. */
	private seen: TaskCalendarSettings;
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
	private readonly groupDrag: GroupDrag;
	/** A card sent to New section, waiting at the end of its list for the section's name. */
	private naming: { readonly item: TaskItem; readonly asked: NameGroup } | null = null;
	private switching = 0;
	/** The place a swipe has just brought the screen to, until the settings have it. */
	private shownMode: RightMode | null = null;
	/** The day a swipe brought in, drawn over the screen until the screen has drawn it itself. */
	private landing: { readonly peek: DayPeek; readonly parts: readonly HTMLElement[] } | null = null;
	/** The day a swipe has drawn nearer than the selected one: the header names it. */
	private titleDay: LocalDate | null = null;
	/** Typing tasks in place: the field, the bar over the keyboard, the plus. */
	private quick: QuickEntryController | null = null;
	private readonly unsubscribe: (() => void)[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: ViewDeps,
	) {
		super(leaf);
		this.seen = this.settings;
		this.selectedDate = this.today();
		this.data = new DayData({ tasks: deps.tasks, calendars: deps.calendars, date: () => this.selectedDate, onUpdate: (part) => this.parts.request(part) });
		this.polling = new CalendarPolling({
			refresh: () => this.data.calendars(),
			intervalMs: () => this.settings.google.refreshSeconds * SECOND_MS,
			hidden: () => document.hidden || !this.contentEl.isShown(),
			now: () => Date.now(),
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
			levels: () => this.deps.tasks.priorityLevels(),
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
		this.unsubscribe.push(StatusBarRoom.hold(root.ownerDocument));
		this.restoreZoom();
		this.fitListWidth();
		this.headers = new ColumnHeaders(root, {
			title: () => dayTitle(this.titleDay ?? this.selectedDate, this.today()),
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
		this.leftDrop = new ListDrop(this.list, this.leftEl, "left", () => true, () => this.sectionsOf("left"), true, () => this.haptics.tap());
		this.inboxEl = el(root, "div", "tc-inbox");
		const inboxPane = el(this.inboxEl, "div", "tc-pane is-inbox");
		const backlogPane = el(this.inboxEl, "div", "tc-pane is-backlog");
		this.inboxList = new TaskList(el(inboxPane, "div"), {
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
		this.inboxDrop = new ListDrop(this.inboxList, inboxPane, "inbox", undatedTakes, () => this.sectionsOf("inbox"), true, () => this.haptics.tap());
		this.backlogTitle = el(el(backlogPane, "div", "tc-pane-head"), "div", "tc-head-title");
		this.backlogList = new TaskList(el(backlogPane, "div"), {
			items: () => this.unnamed(this.data.backlog),
			day: () => null,
			grouped: () => this.sectionsOf("backlog") !== null,
			pending: () => this.namingIn("backlog"),
			entry: () => this.quick?.entryIn("backlog") ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group) => this.groupDrag.attach(head, "backlog", this.backlogList!, group),
			ungroupedName: () => this.settings.groups.ungrouped,
			onCard: (card, item, subtree) => this.attachCard(card, item, "backlog", subtree),
		});
		this.backlogDrop = new ListDrop(this.backlogList, backlogPane, "backlog", undatedTakes, () => this.sectionsOf("backlog"), false, () => this.haptics.tap());
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
		this.soonDrop = new ListDrop(this.soonList, this.soonEl, "soon", (drag) => drag.from !== "timeline", () => this.sectionsOf("soon"), true, () => this.haptics.tap());
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
			bounds: () => {
				const levels = this.zoomLevels();
				return { min: levels[0].hourPx, max: levels[levels.length - 1].hourPx };
			},
			arbiter: this.arbiter,
			minutesAt: (y) => timeline.minutesAt(y),
			onScale: (hourPx, anchor) => this.zoom(hourPx, anchor),
			onRelease: (hourPx) => this.settleZoom(hourPx),
		});
		new FreeRoomDoubleClick([this.leftEl, this.list.el], () => this.quick?.openAtEnd("left"));
		new FreeRoomDoubleClick([this.soonEl, this.soonList.el], () => this.quick?.openAtEnd("soon"));
		new FreeRoomDoubleClick([inboxPane, this.inboxList.el], () => this.quick?.openAtEnd("inbox"));
		new FreeRoomDoubleClick([backlogPane, this.backlogList.el], () => this.quick?.openAtEnd("backlog"));
		const switcher = new ColumnSwitch(root, {
			value: () => this.mode(),
			onChange: (mode) => void this.afterEntry(() => this.setMode(mode)),
			dot: () => this.data.statuses.some((s) => s.stale),
			onSources: () => this.showSources(switcher.el),
			longPressMs: () => this.settings.longPressMs,
			arbiter: this.arbiter,
		});
		this.switcher = switcher;
		const chrome = new ObsidianChrome(root.ownerDocument);
		this.quick = new QuickEntryController({
			root,
			tasks: this.deps.tasks,
			arbiter: this.arbiter,
			drag: this.drag,
			titleField: (parent, opts) => new MarkdownTitleField(this.app, this, this.settings.tasksFile, parent, opts),
			list: (column) => this.listOf(column),
			timeline: () => this.timeline,
			task: (key) => findTask(this.data.day?.slotted ?? [], key),
			dropTargets: () => {
				const shown = this.shownDrops();
				return { lists: shown.filter((drop) => drop instanceof ListDrop), timeline: shown.find((drop) => drop instanceof TimelineDrop) ?? null };
			},
			today: () => this.today(),
			desktop: () => !root.ownerDocument.body.classList.contains("is-mobile"),
			chromeTop: () => chrome.statusBarTop(),
			day: () => this.selectedDate,
			mode: () => this.mode(),
			turnTo: (mode) => this.switcher?.show(mode),
			showDay: (date) => {
				this.select(date);
				return this.data.tasks();
			},
			fresh: (beforeShow) => this.data.tasks(beforeShow),
			render: () => this.parts.request("tasks"),
			onError: (error) => this.reportFailure(error),
		});
		const keyboard = new Keyboard(root, (glide) => this.quick?.keyboardSlides(glide));
		if (Platform.isMobile) this.traceEntry(root);
		this.unsubscribe.push(() => keyboard.destroy());
		const capsule = new BottomCapsule(root, this.deps.undo, { onUndo: () => void this.undoStep("undo"), onSearch: () => this.openSearch() });
		this.unsubscribe.push(() => capsule.destroy());
		this.scope = new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", () => this.undoKey("undo"));
		this.scope.register(["Mod", "Shift"], "z", () => this.undoKey("redo"));
		new Swipe(root, {
			arbiter: this.arbiter,
			accepts: swipeStartsAt,
			target: new ScreenPager({ track: (shift) => this.trackTo(shift), duration: () => tokenMs(root, DURATION.slide), width: () => root.clientWidth }),
		});
		this.unsubscribe.push(
			this.deps.tasks.onChange(() => void this.data.tasks()),
			this.deps.calendars.onChange(() => void this.data.calendars()),
			this.deps.settings.onChange(() => this.onSettings()),
			this.deps.days.onDayChange((change) => this.onDayChange(change), () => this.canTick()),
		);
		this.registerDomEvent(window, "focus", () => this.polling.wake());
		this.registerDomEvent(document, "visibilitychange", () => {
			if (document.hidden) return;
			this.polling.wake();
			this.catchUpTick();
		});
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.polling.catchUp()));
		this.registerDomEvent(root, "touchmove", (e) => {
			if (this.arbiter.busy || e.touches.length > 1) e.preventDefault();
			e.stopPropagation();
		}, { passive: false });
		for (const type of ["touchstart", "touchend", "touchcancel"] as const) this.registerDomEvent(root, type, (e) => e.stopPropagation(), { passive: true });
		this.registerDomEvent(document, "pointerdown", (e) => this.deselectUnless(e.target), { capture: true });
		this.registerDomEvent(document, "pointerdown", (e) => this.bulk.onPress(e.target), { capture: true });
		this.registerDomEvent(document, "keydown", (e) => this.bulk.onKey(e));
		this.arbiter.onIdle(() => {
			this.parts.flush();
			this.catchUpTick();
		});
		this.registerEvent(this.app.workspace.on("css-change", () => this.parts.request("events")));
		this.registerInterval(window.setInterval(() => this.tick(), MINUTE_MS));
		this.polling.start();
		this.render();
		await this.data.load();
	}

	/** Once a minute the now line moves, nothing else is drawn. A hidden view, or one a gesture holds, waits. */
	private tick(): void {
		if (!this.canTick()) {
			this.missedTick = true;
			return;
		}
		this.missedTick = false;
		this.timeline?.tickNow();
	}

	private canTick(): boolean {
		return !(document.hidden || !this.contentEl.isShown() || this.arbiter.busy);
	}

	/** The minute missed while hidden or held is ticked once, the day's check with it. */
	private catchUpTick(): void {
		if (this.missedTick) this.tick();
		this.deps.days.catchUp();
	}

	/**
	 * A day that ended has released its slots (the file is written only when a rule fires): the lists, which depend on
	 * today, are drawn and read anew. Another hour for the day's start moves today and the timeline: the screen opens today afresh.
	 */
	private onDayChange(change: DayChange): void {
		if (change === "passed") {
			this.parts.request("frame", "tasks");
			void this.data.tasks();
			return;
		}
		this.scrolledFor = null;
		this.parts.request("frame", "tasks", "events");
		void this.afterEntry(() => this.select(this.today()));
	}

	override async onClose(): Promise<void> {
		this.quick?.close();
		this.polling.stop();
		this.timeline?.destroy();
		this.unsubscribe.splice(0).forEach((off) => off());
	}

	/** Temporary: how quick entry opens and closes on the phone, frame by frame, in «Task Calendar entry log.md». */
	private traceEntry(root: HTMLElement): void {
		const trace = new EntryTrace(root.ownerDocument, { write: (text) => this.deps.entryLog.append(text) });
		trace.log(`open ${Platform.isIosApp ? "ios" : "mobile"} width=${root.clientWidth}`);
		this.unsubscribe.push(() => trace.destroy());
	}

	override onResize(): void {
		this.fitListWidth();
		this.quick?.reveal();
		this.catchUpTick();
		this.polling.catchUp();
	}

	private get settings() {
		return this.deps.settings.get();
	}

	private today(): LocalDate {
		return this.deps.days.today();
	}

	private boundary(): DayBoundary {
		return this.deps.days.boundary();
	}

	/**
	 * Another card size restacks the timeline. Another name, path or level the screen draws: the headers and the lists
	 * follow at once (the task service reads the tasks anew itself). Anything else redraws nothing here: the day service
	 * tells of another start hour.
	 */
	private onSettings(): void {
		const effect = settingsEffect(this.seen, this.settings);
		this.seen = this.settings;
		if (effect.restack) this.timeline?.layoutTasks();
		if (effect.drawn) this.parts.request("frame", "tasks");
		if (effect.frame) this.parts.request("frame");
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

	private mode(): RightMode {
		return this.shownMode ?? this.settings.rightMode;
	}

	/**
	 * A swipe walks the row of screens as the switch and the arrows do: to the next pair of columns the strip slides under
	 * the finger, to another day each column turns to that day's within itself, and past the row's end it only gives.
	 */
	private trackTo(shift: Shift): ScreenTrack {
		this.landed();
		const root = this.contentEl;
		const parts = stripParts(root);
		const from = { mode: this.mode(), date: this.selectedDate };
		const to = stepScreen(from, shift, this.today());
		if (!to) return new EdgeTrack(parts, root.clientWidth);
		if (to.mode !== from.mode) {
			window.clearTimeout(this.switching);
			root.classList.remove("is-switching");
			return new StripTrack({
				root,
				from: from.mode,
				to: to.mode,
				showMode: (mode) => this.showMode(mode),
				turnWheel: (position) => this.switcher?.follow(position),
				onArrive: (mode) => this.arriveAt(mode),
			});
		}
		this.timeline?.stopHolding();
		const peek = new DayPeek(root, to.date, {
			tasks: this.deps.tasks,
			calendars: this.deps.calendars,
			theme: () => this.theme(),
			today: () => this.today(),
			boundary: () => this.boundary(),
			hourPx: () => this.hourPx,
			now: () => this.deps.clock.now(),
			grouped: (date) => this.deps.tasks.dayColumn(date).sections,
			ungroupedName: () => this.settings.groups.ungrouped,
			listScroll: () => this.list?.el.scrollTop ?? 0,
			alignTimeline: (timeline) => this.timeline && timeline.alignWith(this.timeline),
			allDayExtraRows: () => this.rightEl?.style.getPropertyValue(PROPERTY.allDayExtraRows) ?? "",
		});
		const list: DayLane = {
			shown: () => (this.leftEl ? [...this.leftEl.children].filter((part) => part instanceof HTMLElement) : []),
			next: () => peek.listParts(),
			width: this.leftEl?.offsetWidth ?? 0,
		};
		const timeline: DayLane = {
			shown: () => [...(this.timeline?.dayLayers() ?? []), ...(this.allDayEl?.querySelectorAll<HTMLElement>(".tc-allday") ?? [])],
			next: () => peek.timelineParts(),
			width: this.rightEl?.offsetWidth ?? root.clientWidth,
		};
		return new DayTrack([list, timeline], timeline, peek, shift, {
			onNearer: (nearer) => {
				this.titleDay = nearer ? to.date : null;
				this.headers?.render();
			},
			onArrive: (arrived, shown) => {
				this.landing = { peek: arrived, parts: shown };
				this.scrolledFor = arrived.date;
				void this.afterEntry(() => {
					this.titleDay = null;
					this.select(arrived.date);
				});
			},
		});
	}

	/** The strip stands at the place a swipe brought it to: the switch turns there, and the choice is saved. */
	private arriveAt(mode: RightMode): void {
		this.shownMode = mode;
		this.showMode(mode);
		this.switcher?.show(mode);
		void this.afterEntry(() => this.setMode(mode, false));
	}

	/** The screen has drawn the day a swipe brought in: it comes back from aside, and the day drawn over it goes. */
	private landed(): void {
		const landing = this.landing;
		if (!landing) return;
		this.landing = null;
		restore(landing.parts);
		landing.peek.remove();
	}

	/**
	 * The strip slides only while the window moves to the other pair, in step with the switch's pill, over the columns
	 * already drawn; the divider's drag, a resize and a swipe that already brought it there move it at once. Once the
	 * choice is saved the frame follows it.
	 */
	private async setMode(mode: RightMode, slide = true): Promise<void> {
		const root = this.contentEl;
		if (slide) {
			window.clearTimeout(this.switching);
			root.classList.add("is-switching");
			this.switching = window.setTimeout(() => root.classList.remove("is-switching"), tokenMs(root, DURATION.slide));
		}
		this.shownMode = mode;
		this.showMode(mode);
		await this.deps.settings.update({ rightMode: mode });
		if (this.shownMode === mode) this.shownMode = null;
		this.parts.request("frame");
	}

	private showMode(mode: RightMode): void {
		this.contentEl.classList.toggle("is-lists", mode === "soon");
		this.contentEl.classList.toggle("is-inbox", mode === "inbox");
	}

	private openSearch(): void {}

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
			inbox: [this.inboxDrop, this.backlogDrop, this.soonDrop],
		};
		return shown[this.mode()].filter((target) => target !== null);
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
		const { list, date, sections } = this.deps.tasks.dayColumn(this.selectedDate);
		return sections ? { list, date } : null;
	}

	/**
	 * Whose sections a task's menu offers: its own list's, a task of Soon keeping its due date, and the list column its
	 * card stands in, which then shows the task waiting for a new section's name. None for a subtask, a done task, a card
	 * on the timeline or in a column without sections.
	 */
	private sectionsHome(item: TaskItem, card: HTMLElement): NameGroup | null {
		const list = item.list;
		if (item.parentText !== null || list === "done") return null;
		const columns: ListColumn[] = ["left", "soon", "inbox", "backlog"];
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
				const date = (card.item.list === "soon" ? card.item.dueDate : null) ?? undefined;
				return name === null ? { kind: "moveToGroup", list, group: null, before: null, date } : { kind: "createGroup", list, name, date };
			},
		};
	}

	/** The sections the list has, in its order, then the presets it lacks, in the settings' order; the No section name is none of them. */
	private sectionChoice(list: GroupedList, item: TaskItem): SectionChoice {
		const { presets, ungrouped } = this.settings.groups;
		const tasks = [...(this.data.day?.list ?? []), ...this.data.soon, ...this.data.inbox, ...this.data.backlog].filter((task) => task.list === list);
		const names = [...tasks.flatMap((task) => (task.group === null ? [] : [task.group])), ...presets.map((preset) => preset.trim())];
		return { names: [...new Set(names)].filter((name) => name !== "" && name !== ungrouped), current: item.group, ungrouped };
	}

	private listOf(column: ListColumn): TaskList | null {
		return { left: this.list, soon: this.soonList, inbox: this.inboxList, backlog: this.backlogList }[column];
	}

	/** The lists leave out the card waiting for its section's name; its own list draws it last. */
	private unnamed(items: readonly TaskItem[]): readonly TaskItem[] {
		const naming = this.naming;
		if (!naming) return items;
		return items.filter((item) => !sameTaskTree(item.key, naming.item.key));
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
			levels: tasks.priorityLevels(),
			actions: {
				setStatus: (status) => this.act(() => tasks.setStatus(item.key, status)),
				postpone: (date) => this.act(() => tasks.postpone(item.key, date)),
				removeDue: () => this.act(() => tasks.setDueDate(item.key, null)),
				toSection: (name) => this.act(() => toSection(name)),
				newSection: () => {
					if (home) this.askGroupName(item, home);
				},
				setPriority: (prefix) => this.act(() => tasks.setPriority(item.key, prefix)),
				setReminder: (kind) => this.act(() => tasks.setReminder(item.key, kind)),
				setRepeat: (rule) => this.act(() => tasks.setRepeat(item.key, rule)),
				stop: () => this.act(() => tasks.stop(item.key)),
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
		if (!this.headers || !this.switcher || !this.leftEl || !this.soonEl || !this.inboxEl || !this.rightEl || !this.allDayEl || !this.timeline || !this.list || !this.soonList || !this.inboxList || !this.backlogList || !this.backlogTitle) return;
		if (parts.has("frame")) {
			this.fitListWidth();
			this.headers.render();
			this.showMode(this.mode());
		}
		this.switcher.render();
		if (parts.has("tasks")) {
			this.bulk.selection.forgetDrawn();
			this.list.render();
			const missing = this.data.missing;
			root.classList.toggle("is-missing", missing);
			for (const part of [this.leftEl, this.soonEl, this.inboxEl, this.rightEl]) part.classList.toggle("tc-hidden", missing);
			root.querySelector(".tc-missing")?.remove();
			if (missing) this.renderMissing(root);
			this.soonList.render();
			this.inboxList.render();
			this.backlogTitle.textContent = this.settings.sections.backlog;
			this.backlogList.render();
		}
		const hoursAt = this.landing?.peek.date === this.selectedDate ? { top: this.timeline.el.getBoundingClientRect().top, scroll: this.timeline.el.scrollTop } : null;
		if (parts.has("events")) renderAllDayRows(this.allDayEl, this.rightEl, this.data.events.filter((e) => e.allDay), this.theme(), this.deps.clock.now());
		if (parts.has("tasks") || parts.has("events")) this.timeline.render();
		if (hoursAt !== null) this.keepHoursAt(hoursAt);
		if (parts.has("tasks") && this.scrolledFor !== this.selectedDate) {
			this.scrolledFor = this.selectedDate;
			this.scrollToOpen(this.timeline, this.selectedDate);
		}
		if (this.landing?.peek.date === this.selectedDate && (this.data.missing || this.data.day?.date === this.selectedDate)) this.landed();
		this.quick?.rendered();
	}

	/**
	 * The day a swipe brought in may end sooner, or have more or fewer rows of all-day events, than the one it replaced:
	 * the timeline keeps its scroll, moved by as much as the rows push it, so the hours stay where they stood.
	 */
	private keepHoursAt(at: { readonly top: number; readonly scroll: number }): void {
		if (!this.timeline) return;
		this.timeline.holdScroll(at.scroll + this.timeline.el.getBoundingClientRect().top - at.top);
	}

	/** Today opens on the now line, another day at the hour the settings name. */
	private scrollToOpen(timeline: Timeline, date: LocalDate): void {
		const boundary = this.boundary();
		if (date === this.today()) timeline.scrollTo(boundary.offsetOf(date, this.deps.clock.now()), LAYOUT.nowFraction);
		else timeline.scrollTo(boundary.offsetOfHour(this.settings.scrollToHour), 0);
	}

	private renderMissing(root: HTMLElement): void {
		const box = el(root, "div", "tc-missing");
		el(box, "div", "", `No tasks file at ${this.settings.tasksFile}`);
		Button.create(box, { kind: "pill", label: "Create file", cls: "tc-missing-btn", onPress: () => void this.act(() => this.deps.tasks.createFile()) });
	}

}

import { type App, Component, MarkdownView, Notice, Platform, type Scope } from "obsidian";
import { type CalendarEvent, type CalendarPoll, type CalendarService, type CarryEnd, type CarryStart, type DayBoundary, type DayChange, type DayService, type DropColumn, type EntryList, type FunnelView, funnelPlaceShowing, type GroupedList, type ListGroup, type ListSection, type MenuFrom, type ProjectFilter, projectNodeOf, type ProjectsCard, type ProjectsDrop, type ProjectsDropLanding, type ProjectsLanding, type ProjectsListRow, type ProjectsNodeId, type ListPlace, projectsPlusTakes, projectsTakes, type MenuScreen, endsSelection, sameTaskTree, StaleTaskError, type TaskItem, type TaskScreen, type TaskService, type UndoService, type Clock, viewEntryLists, type ViewChoice, type ViewMode, type ZoomLevel } from "../../core/application/contracts";
import { type RightMode, type ShownSettings, type ShownSettingsStore } from "./viewSettings";
import { renderAllDayRows } from "./AllDayRow";
import { BottomCapsule } from "./BottomCapsule";
import { FoundCard } from "./FoundCard";
import { ArrivingCard } from "./drag/ArrivingCard";
import { SearchWindow } from "./search/SearchWindow";
import { BulkController } from "./BulkController";
import type { Theme } from "./eventColors";
import { DayData } from "./DayData";
import { DayNav } from "./DayNav";
import { ColumnSwitch } from "./ColumnSwitch";
import { DragController } from "./drag/DragController";
import { ListDrop } from "./drag/ListDrop";
import { type ColumnSections, type DropResult, droppedTasks, type HeldOut, isProjectsDrop, type ListColumn, type TaskDragPayload } from "./drag/DropTarget";
import { GroupDrag } from "./drag/GroupDrag";
import { GroupMenu, ProjectMenu } from "./menu/GroupMenu";
import { NoteSearch } from "./projects/NoteSearch";
import { ProjectsListDrop, TreeDrop } from "./projects/ProjectDrops";
import { CarryReport } from "./projects/CarryReport";
import { FilterTitle } from "./projects/FilterTitle";
import { ProjectsCarry } from "./projects/ProjectsCarry";
import { ProjectTasks } from "./projects/ProjectTasks";
import { TreeLift } from "./projects/TreeLift";
import { TreePanel } from "./projects/TreePanel";
import { ViewButton } from "./ViewButton";
import type { PlusAside } from "./quick/QuickEntryController";
import { failureText } from "./failureText";
import { GroupNameField } from "./GroupNameField";
import { TimelineDrop } from "./drag/TimelineDrop";
import { GestureArbiter } from "./gestures";
import { detectHaptics, type HapticsHost } from "./haptics";
import { EventMenu } from "./menu/EventMenu";
import { TaskMenu } from "./menu/TaskMenu";
import type { Sheet } from "./menu/LiftedMenu";
import type { EditorOwner } from "./markdown/EmbeddedEditor";
import { ObsidianMarkdown } from "./markdown/ObsidianMarkdown";
import { MarkdownTitleField } from "./quick/MarkdownTitleField";
import { QuickEntryController } from "./quick/QuickEntryController";
import { ObsidianChrome } from "./quick/ObsidianChrome";
import { FullScreen } from "./full/FullScreen";
import { MoreMenu } from "./menu/MoreMenu";
import type { CloseHow, Overlay } from "./menu/Overlay";
import type { TaskLink } from "./TaskTitle";
import { SourcesPopover } from "./sources/SourcesPopover";
import { levelsFor, zoomAfterPinch, zoomShown } from "./zoomLevels";
import { dayTitle } from "./dayTitle";
import { DESIGN, DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import type { FunnelListDeps } from "./layouts/FunnelLists";
import type { LayoutHost, RibbonHost, SharedParts } from "./layouts/LayoutHost";
import type { LayoutDrop, LayoutMotion, ModeLayout } from "./layouts/ModeLayout";
import { mountLayout } from "./layouts/mountLayout";
import { clear, el } from "./dom";
import { Button } from "./kit/Button";
import { Keyboard } from "./Keyboard";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { type ScreenPart, ScreenParts } from "./ScreenParts";
import { settingsEffect } from "./settingsEffect";
import { StatusBarRoom } from "./StatusBarRoom";
import { type Place, type Shift } from "./screens";
import { Swipe, swipeStartsAt } from "./Swipe";
import { DayPeek } from "./DayPeek";
import { ScreenPager, type ScreenTrack } from "./ScreenPager";
import { type DayLane, DayTrack, EdgeTrack, restore } from "./ScreenTracks";
import { onCounter, onProjectMark } from "./TaskCard";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate } from "./types";

const MINUTE_MS = 60_000;
/** The place of the screens a list stands at: Backlog under Inbox, Done left of it. */
const PLACE_OF_LIST: Readonly<Record<Extract<TaskScreen, { kind: "list" }>["list"], Place>> = { done: "done", inbox: "inbox", backlog: "inbox", soon: "soon" };

/** The docked panel slides in or out, the columns moving with it. */
const DOCKING = "is-docking";
/** Another context drawn: its styles settle with no transition, so nothing on it slides in (spec decision 52). */
const REDRAWN = "is-redrawn";
/** The gesture that holds the screen while a new section's name is typed: no redraw takes the field away. */
const NAMING = "naming";
/** How long a tap waits at most for the screen to draw the day the last turn brought in. */
const LANDING_WAIT_MS = 1000;

export interface ViewDeps {
	readonly tasks: TaskService;
	/** Which day today is, where it begins, and when that changes. */
	readonly days: DayService;
	/** The plugin's own changes of the tasks file, taken back by the corner button and Cmd+Z. */
	readonly undo: UndoService;
	readonly calendars: CalendarService;
	readonly settings: ShownSettingsSource;
	readonly clock: Clock;
	/** Apple's Calendar at the event. */
	openInCalendar(event: CalendarEvent): void;
}

/** What the screen reads of the settings, and the only ones it sets: where its window stands, its divider and its zoom. */
export type ShownSettingsSource = Pick<ShownSettingsStore, "get" | "set" | "onChange">;

/** Where a screen is shown: the plugin's own view. */
export interface ScreenPlace {
	/** The plugin's own view shows the undo capsule; a note's block doesn't. Both keep Obsidian's status bar off their foot. */
	readonly view: boolean;
	/** The keys of a note's block, over Obsidian's: its fields' own keys stand over them, so none reaches the note. */
	readonly keys?: Scope;
	/** A project note's block: the note's path, whose project's view it shows (`TaskService.projectNoteView`). */
	readonly note?: () => string;
}

/**
 * The screen: a window two columns wide on a strip of four, Inbox over Backlog, Soon, the list of the day (Now) and the
 * day's timeline, each list under its header. The window shows Inbox and Soon or Soon and Now, halved by a fixed divider, or Now and the
 * timeline, parted by the divider that sets the list's width; the switch at the bottom slides the strip, headers and all.
 */
export class CalendarScreen extends Component {
	private selectedDate: LocalDate;
	/** A minute passed while the view was hidden or a gesture held it: it ticks once as soon as it can. */
	private missedTick = false;
	private dayNav: DayNav | null = null;
	/** The view mode's layout: the ribbon, all columns, the rows or by project; one at a time. */
	private layout: ModeLayout | null = null;
	/** The ribbon's swipe, attached only while a layout has pages to turn. */
	private swipe: Swipe | null = null;
	/** The context (`ViewChoice.context`) the lists were last drawn in: another one is drawn still. */
	private drawnContext: string | null = null;
	/** The changes asked for, one after another. */
	private changing: Promise<unknown> = Promise.resolve();
	/** The timer that ends the docked panel's slide. */
	private docking = 0;
	/** Where layouts stand among the screen's parts: before the fade and the controls. */
	private fadeEl: HTMLElement | null = null;
	private switcher: ColumnSwitch | null = null;
	/** The projects' tree as a panel: docked left of the lists on the desktop, over them on the phone; none in a note's block. */
	private panel: TreePanel | null = null;
	/** The view and the place before the first read answers. */
	private firstView: ViewChoice | null = null;
	private firstPlace: RightMode | null = null;
	/** The projects button at the top left: it opens and closes the panel. */
	private folder: Button | null = null;
	/** The filter's name over the tasks and the cross that clears it. */
	private filterTitle: FilterTitle | null = null;
	/** The view button in the bottom row. */
	private viewButton: ViewButton | null = null;
	/** The tree as a place for a card or the plus, while the panel shows. */
	private readonly treeDrop = new TreeDrop({
		tree: () => (this.treeShows() ? (this.panel?.treeShown ?? null) : null),
	});
	/** Where a carrying finger is, told to the core's carry: the left edge, a row of the panel. */
	private readonly carryReport = new CarryReport({
		tasks: this.deps.tasks,
		root: () => this.contentEl,
		tree: () => (this.treeShows() ? (this.panel?.treeShown ?? null) : null),
		now: () => this.deps.clock.now().getTime(),
		/** The panel, the tree and, when the held card opened another node, its lists follow the carry at once. */
		changed: () => this.data.tasks().then(() => this.drawCarried()),
		onError: (error) => this.reportFailure(error),
	});
	/** A carry the core keeps is under way (a card or the plus lifted in the plugin's own view). */
	private carrying = false;
	/** The rows each drag from the by project list carries and the node it was lifted on, read at the lift. */
	private readonly carry = new ProjectsCarry({
		rowOf: (card) => this.layout?.projects()?.rowOf(card),
		selected: () => this.data.projects?.selected ?? this.filterNode(),
		carried: (item) => this.bulk.carried(item),
	});
	/** The window stands at Done, left of Inbox: only the search brings it there, and any other move leaves it. */
	private atDone = false;
	private search: SearchWindow | null = null;
	/** The task on the whole screen, while one is. */
	private full: FullScreen | null = null;
	private readonly found = new FoundCard();
	private readonly arriving = new ArrivingCard();
	private rightEl: HTMLElement | null = null;
	private allDayEl: HTMLElement | null = null;
	private timeline: Timeline | null = null;
	private hourPx: number = DESIGN.hourPx;
	private readonly data: DayData;
	/** The events kept fresh while the view is open. */
	private poll: CalendarPoll | null = null;
	/** The frame, the tasks and the events, each drawn when it changes; a gesture holds them all. */
	private readonly parts = new ScreenParts({ busy: () => this.arbiter.busy, draw: (parts) => this.draw(parts) });
	/** The quick field's editor while it has the focus: Obsidian's commands and hotkeys go to it. */
	activeEditor: EditorOwner | null = null;
	private scrolledFor: LocalDate | null = null;
	/** The lists were last drawn from tasks read: what changes from then on moves into place; the first cards read are drawn at once. */
	private drawnRead = false;
	/** The settings the screen last followed: a change is weighed against them. */
	private seen: ShownSettings;
	private readonly arbiter = new GestureArbiter();
	private readonly haptics = detectHaptics(window as unknown as HapticsHost);
	private readonly drag: DragController;
	/** Picking several list cards on the desktop, and what is done to them all. */
	private readonly bulk: BulkController;
	private timelineDrop: TimelineDrop | null = null;
	private zoomFrame = 0;
	/** The pinch settled on the whole day: it keeps fitting as the timeline's height changes. */
	private wholeDay = false;
	private readonly groupDrag: GroupDrag;
	/** A card sent to New section, waiting at the end of its column for the section's name. */
	private naming: { readonly item: TaskItem; readonly column: ListColumn } | null = null;
	/** The place a swipe has just brought the screen to, until the settings have it. */
	private shownMode: RightMode | null = null;
	/** The day a swipe brought in, drawn over the screen until the screen has drawn it itself. */
	private landing: { readonly peek: DayPeek; readonly parts: readonly HTMLElement[] } | null = null;
	/** The screen a swipe or an arrow slides. */
	private pager: ScreenPager | null = null;
	/** The arrows' taps, one turn after another. */
	private turning: Promise<void> = Promise.resolve();
	/** Taps waiting for the screen to draw the day the last turn brought in. */
	private drawnWaits: (() => void)[] = [];
	/** The day a swipe has drawn nearer than the selected one: the header names it. */
	private titleDay: LocalDate | null = null;
	/** Typing tasks in place: the field, the bar over the keyboard, the plus. */
	private quick: QuickEntryController | null = null;
	private readonly unsubscribe: (() => void)[] = [];

	constructor(
		readonly app: App,
		readonly contentEl: HTMLElement,
		private readonly deps: ViewDeps,
		private readonly where: ScreenPlace,
	) {
		super();
		this.seen = this.settings;
		this.selectedDate = this.today();
		this.data = new DayData({ tasks: deps.tasks, calendars: deps.calendars, date: () => this.selectedDate, view: () => this.readView(), onUpdate: (part) => this.parts.request(part) });
		this.groupDrag = new GroupDrag({
			longPressMs: () => this.settings.longPressMs,
			arbiter: this.arbiter,
			haptics: this.haptics,
			ungroupedName: () => this.settings.ungrouped,
			onTap: (head, list, group) => this.showGroupMenu(head, list, group),
			onMove: (list, group, place) => this.act(() => this.deps.tasks.moveGroup(list, group, place)),
		});
		this.bulk = new BulkController({
			root: this.contentEl,
			pickStatus: (keys, id) => this.act(() => this.deps.tasks.pickStatus(keys, id)),
			postpone: (keys, date) => this.act(() => this.deps.tasks.postponeAll(keys, date)),
			remove: (keys) => this.act(() => this.deps.tasks.removeAll(keys)),
			today: () => this.today(),
			day: () => this.selectedDate,
			menu: (picked) => this.deps.tasks.bulkMenu(picked, this.menuScreen()),
			togglePriority: (keys, prefix) => this.act(() => this.deps.tasks.togglePriority(keys, prefix)),
			toggleLabel: async (keys, name) => {
				const written: { items: readonly (TaskItem | null)[] } = { items: keys.map(() => null) };
				await this.act(async () => {
					written.items = await this.deps.tasks.toggleLabel(keys, name);
				});
				return written.items;
			},
			removeDue: (keys) => this.act(() => this.deps.tasks.removeDue(keys)),
			carried: (lifted, picked) => this.deps.tasks.carried(lifted, picked),
			cards: (picked) => {
				const projects = this.layout?.projects() ?? null;
				return (projects?.rowOf(picked.card) ? projects.cards : (this.listOf(picked.column)?.cards ?? [])).map((entry) => entry.card);
			},
			toSection: (keys, name) => this.act(() => this.deps.tasks.toSection(keys, name)),
			setProject: (keys, project) => this.act(() => this.deps.tasks.setProject(keys, project)),
			newProject: (keys, name) => this.act(async () => (await this.deps.tasks.newProject(name, keys)) !== null),
			toggleProject: (items, name) => this.toggleProject(items, name),
			desktop: () => !this.contentEl.ownerDocument.body.classList.contains("is-mobile"),
			isMod: (e) => (Platform.isMacOS ? e.metaKey : e.ctrlKey),
		});
		this.drag = new DragController({
			longPressMs: () => this.settings.longPressMs,
			day: () => this.selectedDate,
			snap: (minute) => this.deps.tasks.snap(minute, this.hourPx, LAYOUT.snapTolerance),
			timeline: () => this.timeline,
			targets: (drag) => [...this.bulk.targets(drag), ...this.shownDrops()],
			pick: (_item, card, e, how) => {
				const picked = this.bulk.selection.cardOf(card);
				return picked !== undefined && this.bulk.pick(picked, e, how);
			},
			fold: (item, pressed) => this.fold(item, pressed),
			mark: (item, pressed) => this.openProjectOf(item, pressed),
			carried: (item) => this.bulk.carried(item),
			haptics: this.haptics,
			arbiter: this.arbiter,
			onDragging: (active) => {
				if (!active) {
					this.bulk.settled();
					this.arriving.arrived();
				}
				this.quick?.onDragging(active);
				this.contentEl.classList.toggle("is-dragging", active);
				this.layout?.hold("carry", active);
				if (!active) this.carryReport.end();
			},
			moved: (x, y) => {
				if (this.carrying && this.panel) this.carryReport.move(x, y);
			},
			onResult: (drag, result) => this.applyDrop(drag, result),
			onError: (error) => this.reportFailure(error),
			onLift: (drag, source) => {
				this.carry.lift(drag, source);
				const cards = this.carry.dropsOf(drag);
				this.startCarry({ keys: droppedTasks(drag).map((task) => task.key), ...(cards.length > 0 && { cards }) });
			},
			putBack: () => this.endCarry("nowhere"),
			stretch: (item, edge, minute) => this.deps.tasks.stretch(item, this.selectedDate, edge, minute),
			onResize: async (item, edge, minute, minDurationMin) => {
				let written = false;
				await this.act(async () => (written = await this.deps.tasks.resize(item.key, this.selectedDate, edge, minute, minDurationMin)));
				return written;
			},
			onMenu: (item, source, lifted, held) => this.showMenu(item, source, lifted, undefined, held),
			onRename: (item) => this.quick?.rename(item),
			newSlot: () => this.timelineDrop,
			onNewSlot: (slot) => this.quick?.openSlot(slot),
		});
	}

	/**
	 * Obsidian opens its side panels on swipes from the screen's edges; inside the view the fingers belong to the view. While a
	 * gesture holds the screen the touches are also kept from scrolling: iOS would otherwise cancel the pointer mid-drag.
	 */
	async open(): Promise<void> {
		const root = this.contentEl;
		clear(root);
		root.classList.add("task-calendar", "tc-view");
		this.unsubscribe.push(StatusBarRoom.hold(root.ownerDocument));
		if (!this.where.view) root.classList.add("is-block");
		/** The place and the view as the device keeps them, read once as the view opens: a carry the last run left is dropped then. */
		this.firstPlace = this.deps.tasks.firstPlace();
		this.firstView = this.deps.tasks.firstView(this.wide(), this.where.note !== undefined);
		this.restoreZoom();
		this.dayNav = new DayNav(root, {
			title: () => this.dayName(),
			onStep: (days) => this.turnDay(() => ({ date: this.deps.days.step(this.selectedDate, days), shift: days < 0 ? -1 : 1 })),
			onToday: () => this.turnDay(() => (this.deps.days.relation(this.selectedDate) === "today" ? null : { date: this.today(), shift: this.selectedDate < this.today() ? 1 : -1 })),
		});
		this.rightEl = el(root, "div", "tc-right");
		this.allDayEl = el(this.rightEl, "div");
		this.timeline = new Timeline(el(this.rightEl, "div"), {
			theme: () => this.theme(),
			date: () => this.selectedDate,
			isToday: () => this.deps.days.relation(this.selectedDate) === "today",
			boundary: () => this.boundary(),
			hourPx: () => this.hourPx,
			tasks: () => this.data.day?.slotted ?? [],
			shownSpan: (item) => this.deps.tasks.shownSpan(item, this.selectedDate),
			events: () => this.data.timed,
			isPast: (event) => this.deps.calendars.isPast(event),
			now: () => this.deps.clock.now(),
			onResize: () => this.fitWholeDay(),
			onBlock: (block, item, signal) => {
				this.found.attach(block, item);
				this.arriving.attach(block, item);
				this.drag.attachBlock(block, item, signal);
			},
			onEvent: (block, event, signal) => this.drag.attachEvent(block, () => EventMenu.open({ source: block, openInCalendar: () => this.deps.openInCalendar(event) }), signal),
			onGrip: (block, item, edge, e) => this.drag.grip(block, item, edge, e),
		});
		this.fadeEl = el(root, "div", "tc-fade");
		this.timelineDrop = new TimelineDrop(this.timeline, {
			snap: (minute) => this.deps.tasks.snap(minute, this.hourPx, LAYOUT.snapTolerance),
			span: (item, from, start) => this.deps.tasks.dropSpan(item, from, start),
			newSlot: (start) => this.deps.tasks.newSlot(this.selectedDate, start),
		});
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
		const switcher = new ColumnSwitch(root, {
			value: () => this.place(),
			onChange: (mode) => void this.afterEntry(() => this.leaveDone(mode)),
			dot: () => ({ alert: this.data.alert, words: this.data.words.alert }),
			onSources: () => this.showSources(switcher.el),
			longPressMs: () => this.settings.longPressMs,
			arbiter: this.arbiter,
			host: root,
		});
		this.switcher = switcher;
		this.viewButton = new ViewButton(root, (mode) => void this.pickView(mode));
		this.buildPanel(root);
		const chrome = new ObsidianChrome(root.ownerDocument);
		this.quick = new QuickEntryController({
			root,
			tasks: this.deps.tasks,
			arbiter: this.arbiter,
			drag: this.drag,
			titleField: (parent, opts) => new MarkdownTitleField(this.app, this, this.settings.tasksFile, parent, opts, this.where.keys),
			list: (column) => (column === "projects" ? (this.layout?.projects() ?? null) : this.listOf(column)),
			sectioned: (column) => column !== "projects" && this.sectionsOf(column) !== null,
			timeline: () => this.timeline,
			task: (key) => this.deps.tasks.findIn(this.data.day?.slotted ?? [], key),
			aside: () => this.projectsPlus(),
			dropTargets: () => {
				const shown = this.shownDrops();
				return { lists: shown.filter((drop) => drop instanceof ListDrop), timeline: shown.find((drop) => drop instanceof TimelineDrop) ?? null };
			},
			today: () => this.today(),
			desktop: () => !root.ownerDocument.body.classList.contains("is-mobile"),
			chromeTop: () => chrome.statusBarTop(),
			day: () => this.selectedDate,
			shown: () => this.shownLists(),
			filter: () => {
				const filter = this.data.funnel?.filter ?? null;
				return filter && { node: filter.node, project: filter.project };
			},
			turnTo: (column) => {
				if (column !== "projects" && this.view().ribbon) this.switcher?.show(funnelPlaceShowing(column, this.place()));
			},
			showDay: (date) => {
				this.select(date);
				return this.data.tasks();
			},
			fresh: (beforeShow) => this.data.tasks(beforeShow),
			render: () => this.parts.request("tasks"),
			locksPanel: (locked) => {
				if (this.folder) this.folder.el.disabled = locked;
			},
			onError: (error) => this.reportFailure(error),
		});
		const keyboard = new Keyboard(root, (glide) => this.quick?.keyboardSlides(glide));
		this.unsubscribe.push(() => keyboard.destroy());
		{
			const capsule = new BottomCapsule(root, this.deps.undo, {
				onUndo: () => void this.undoStep("undo"),
				onMore: (anchor) => MoreMenu.open({ anchor, onSearch: (sheet) => this.openSearch(sheet), onSelect: () => this.bulk.start() }),
			});
			this.unsubscribe.push(() => capsule.destroy());
		}
		this.bulk.mount();
		this.pager = new ScreenPager({ track: (shift) => {
				this.landed();
				return this.layout?.track?.(shift) ?? new EdgeTrack([], 0);
			}, duration: () => tokenMs(root, DURATION.slide), width: () => root.clientWidth });
		this.mount(this.view());
		this.unsubscribe.push(
			this.deps.tasks.onChange(() => {
				void this.data.tasks();
				void this.full?.refresh();
			}),
			this.deps.calendars.onChange(() => void this.data.calendars()),
			this.deps.settings.onChange(() => this.onSettings()),
			this.deps.days.onDayChange((change) => this.onDayChange(change), () => this.canTick()),
		);
		const doc = root.ownerDocument;
		const win = doc.defaultView ?? window;
		this.registerDomEvent(win, "focus", () => this.poll?.wake());
		this.registerDomEvent(doc, "visibilitychange", () => {
			if (doc.hidden) return;
			this.poll?.wake();
			this.catchUpTick();
		});
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.poll?.catchUp()));
		this.registerDomEvent(root, "touchmove", (e) => {
			if (this.arbiter.busy || e.touches.length > 1) e.preventDefault();
			e.stopPropagation();
		}, { passive: false });
		for (const type of ["touchstart", "touchend", "touchcancel"] as const) this.registerDomEvent(root, type, (e) => e.stopPropagation(), { passive: true });
		this.registerDomEvent(doc, "pointerdown", (e) => this.deselectUnless(e.target), { capture: true });
		this.registerDomEvent(doc, "pointerdown", () => this.found.clear(), { capture: true });
		this.registerDomEvent(doc, "pointerdown", (e) => this.bulk.onPress(e.target), { capture: true });
		this.registerDomEvent(doc, "keydown", (e) => this.bulk.onKey(e));
		this.arbiter.onIdle(() => {
			this.parts.flush();
			this.catchUpTick();
		});
		this.registerEvent(this.app.workspace.on("css-change", () => this.parts.request("events")));
		this.registerInterval(win.setInterval(() => this.tick(), MINUTE_MS));
		this.poll = this.deps.calendars.keepFresh({ refresh: () => this.data.calendars(), hidden: () => this.hidden() });
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
		return !(this.hidden() || this.arbiter.busy);
	}

	/** Its window hidden, or the screen itself out of sight: a popout window's screen asks its own window. */
	private hidden(): boolean {
		return this.contentEl.ownerDocument.hidden || !this.contentEl.isShown();
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

	close(): void {
		this.drag.destroy();
		if (this.carrying) void this.endCarry("nowhere");
		this.swipe?.destroy();
		this.layout?.destroy();
		this.layout = null;
		this.full?.close();
		this.quick?.close();
		this.poll?.stop();
		this.timeline?.destroy();
		this.unsubscribe.splice(0).forEach((off) => off());
	}

	resize(): void {
		this.layout?.frame();
		this.quick?.reveal();
		this.catchUpTick();
		this.poll?.catchUp();
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
		return this.contentEl.ownerDocument.body.classList.contains("theme-light") ? "light" : "dark";
	}

	/** The width the lists and the timeline share: the view's, less the docked panel's. */
	private stageWidth(): number {
		const docked = this.contentEl.classList.contains("has-dock") ? (this.panel?.el.offsetWidth ?? 0) : 0;
		return this.contentEl.clientWidth - docked;
	}

	/**
	 * The layout of `view`'s mode, mounted in place of the one that stood: its lists drawn still (another context), the
	 * swipe attached only where it has pages to turn. The timeline keeps its scroll through the move.
	 */
	private mount(view: ViewChoice): void {
		const scroll = this.timeline?.el.scrollTop ?? 0;
		this.swipe?.destroy();
		this.swipe = null;
		this.layout?.destroy();
		this.layout = mountLayout(this.layoutHost(), view.layout);
		this.drawnContext = null;
		this.layout.showPlace(this.place(), false);
		this.timeline?.holdScroll(scroll);
		if (this.layout.track && this.pager) this.swipe = new Swipe(this.contentEl, { arbiter: this.arbiter, accepts: swipeStartsAt, target: this.pager });
	}

	/** What a layout reads of the screen: the shared parts, the lists' and Done's gestures, the measures. */
	private layoutHost(): LayoutHost {
		const root = this.contentEl;
		return {
			root,
			shared: this.sharedParts(),
			lists: this.listDeps(),
			ribbon: this.ribbonHost(),
			arbiter: this.arbiter,
			listName: (column) => (column === "day" ? this.dayName() : this.deps.tasks.listName(column)),
			dayName: () => this.dayName(),
			view: () => this.view(),
			share: () => this.settings.listShare,
			saveShare: (share) => void this.deps.settings.set({ listShare: share }).then(() => this.parts.request("frame")),
			stageWidth: () => this.stageWidth(),
			projectsList: (area) => this.buildByProject(area),
			projectsView: () => this.data.projects,
			tap: () => this.haptics.tap(),
		};
	}

	/** The day's title and the timeline's column: one each for the screen, which each layout stands where its day is. */
	private sharedParts(): SharedParts {
		const root = this.contentEl;
		const nav = this.dayNav!;
		const timeline = this.rightEl!;
		const fade = this.fadeEl!;
		return {
			nav: nav.el,
			dayTitle: nav.titleEl,
			timeline,
			place: (navIn, timelineIn) => {
				const scroll = this.timeline?.el.scrollTop ?? 0;
				if (navIn) navIn.appendChild(nav.el);
				else root.insertBefore(nav.el, fade);
				if (timelineIn) timelineIn.appendChild(timeline);
				else root.insertBefore(timeline, fade);
				this.timeline?.holdScroll(scroll);
			},
		};
	}

	/** What a funnel list reads of the screen, in whichever layout it stands. */
	private listDeps(): FunnelListDeps {
		return {
			items: (column) => this.unnamed(this.itemsOf(column)),
			day: () => this.selectedDate,
			sectionsOf: (column) => this.sectionsOf(column),
			listSections: (column) => this.listSectionsOf(column),
			naming: (column) => this.namingIn(column),
			entry: (column, drawing) => this.quick?.entryIn(column, drawing) ?? null,
			plate: (column) => this.view().plates[column],
			emptyLabel: () => this.view().emptyLabel,
			openAtEnd: (column) => this.quick?.openAtEnd(column),
			openIn: (column, group) => this.quick?.openIn(column, group),
			renaming: () => this.quick?.renaming() ?? null,
			header: (head, list, owner, group, signal) => this.groupDrag.attach(head, list, owner, group, signal),
			ungroupedName: () => this.settings.ungrouped,
			card: (card, item, column, subtree, signal) => this.attachCard(card, item, column, subtree, signal),
			titleDrop: (column) => this.data.titleDrop(column),
			tap: () => this.haptics.tap(),
		};
	}

	/** What the ribbon asks to walk its places and turn its days. */
	private ribbonHost(): RibbonHost {
		return {
			place: () => this.place(),
			day: () => this.selectedDate,
			stepFunnel: (from, shift) => this.deps.days.stepFunnel(from, shift),
			dayTrack: (day, shift) => this.dayTrack(day, shift),
			arrive: (place) => this.arriveAt(place),
			follow: (position) => this.switcher?.follow(position),
			done: () => this.data.done,
			doneCard: (card, item, signal) => this.attachDoneCard(card, item, signal),
		};
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
		this.dayNav?.render();
		void this.data.selectDay();
	}

	/** The place the window stands at: one a swipe or the wheel has just brought it to, else the core's (`FunnelView.place`). */
	private mode(): RightMode {
		return this.shownMode ?? this.data.funnel?.place ?? (this.firstPlace ??= this.deps.tasks.firstPlace());
	}

	/**
	 * The day's arrows and its name turn the day as a swipe to it does, the whole way with no finger. A tap during a turn,
	 * or while a swipe runs to its place, lets that run on to its place, and the day turns on from there once the screen
	 * has drawn the day it brought in (decision 51). A finger that swipes during a turn catches the day where it is seen,
	 * and the turns still waiting are dropped.
	 */
	private turnDay(to: () => { readonly date: LocalDate; readonly shift: Shift } | null): void {
		const caught = this.pager?.caught ?? 0;
		this.turning = this.turning.then(async () => {
			await this.drawnLanding();
			await this.afterEntry(async () => {
				const way = to();
				const pager = this.pager;
				if (!way || !pager || pager.caught !== caught) return;
				await pager.run(way.shift, () => this.dayTrack(way.date, way.shift));
			});
		}).catch((error: unknown) => this.reportFailure(error));
	}

	/** Resolves once the screen has drawn the day a turn brought in, or at once when none waits to be drawn. */
	private drawnLanding(): Promise<void> {
		if (!this.landing) return Promise.resolve();
		return new Promise((resolve) => {
			this.drawnWaits.push(resolve);
			window.setTimeout(resolve, LANDING_WAIT_MS);
		});
	}

	/** Another day `shift`'s way: in each column the shown day slides out and `day`'s comes in; the header and the hours stand. */
	private dayTrack(day: LocalDate, shift: Shift): ScreenTrack {
		this.landed();
		const root = this.contentEl;
		this.timeline?.stopHolding();
		const peek = new DayPeek(root, day, {
			tasks: this.deps.tasks,
			calendars: this.deps.calendars,
			theme: () => this.theme(),
			relation: (date) => this.deps.days.relation(date),
			boundary: () => this.boundary(),
			hourPx: () => this.hourPx,
			now: () => this.deps.clock.now(),
			sections: (date) => {
				const shown = this.deps.tasks.columnSections("day", date);
				return shown ? this.data.sections[shown.list] : null;
			},
			ungroupedName: () => this.settings.ungrouped,
			listScroll: () => this.listOf("day")?.el.scrollTop ?? 0,
			alignTimeline: (timeline) => this.timeline && timeline.alignWith(this.timeline),
			allDayExtraRows: () => this.rightEl?.style.getPropertyValue(PROPERTY.allDayExtraRows) ?? "",
			filter: () => this.filterNode(),
			emptyLabel: () => this.view().emptyLabel,
			frames: () => ({ list: this.layout?.dayLane() ?? null, timeline: this.rightEl ?? root }),
		});
		const lane = this.layout?.dayLane() ?? null;
		const list: DayLane | null = lane && {
			shown: () => [...lane.children].filter((part) => part instanceof HTMLElement),
			next: () => peek.listParts(),
			width: lane.offsetWidth,
		};
		const timeline: DayLane = {
			shown: () => [...(this.timeline?.dayLayers() ?? []), ...(this.allDayEl?.querySelectorAll<HTMLElement>(".tc-allday") ?? [])],
			next: () => peek.timelineParts(),
			width: this.rightEl?.offsetWidth ?? root.clientWidth,
		};
		return new DayTrack(list ? [list, timeline] : [timeline], timeline, peek, shift, {
			onNearer: (nearer) => {
				this.titleDay = nearer ? day : null;
				this.dayNav?.render();
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

	/** The strip stands at the place a swipe brought it to: the switch turns there, and the choice is saved. Done is left behind. */
	private arriveAt(place: Place): void {
		if (place === "done") return;
		this.atDone = false;
		this.shownMode = place;
		this.layout?.showPlace(place, false);
		this.switcher?.show(place);
		void this.afterEntry(() => this.setMode(place, false));
	}

	/** Where the window stands: Done while the search keeps it there, else the place the settings hold. */
	private place(): Place {
		return this.atDone ? "done" : this.mode();
	}

	/** The wheel turned the screen away: Done goes until the search opens it again. */
	private leaveDone(mode: RightMode): Promise<void> {
		this.atDone = false;
		return this.setMode(mode);
	}

	/** The screen has drawn the day a swipe brought in: it comes back from aside, and the day drawn over it goes. */
	private landed(): void {
		const landing = this.landing;
		if (!landing) return;
		this.landing = null;
		restore(landing.parts);
		landing.peek.remove();
		const waits = this.drawnWaits.splice(0);
		for (const wait of waits) wait();
	}

	/**
	 * The strip slides only while the window moves to the other pair, in step with the switch's pill, over the columns
	 * already drawn; the divider's drag, a resize and a swipe that already brought it there move it at once. Once the
	 * choice is saved the frame follows it.
	 */
	private async setMode(mode: RightMode, slide = true): Promise<void> {
		this.shownMode = mode;
		this.layout?.showPlace(this.place(), slide);
		await this.act(() => this.deps.tasks.setFunnelPlace(mode));
		if (this.shownMode === mode) this.shownMode = null;
		this.parts.request("frame");
	}

	/** A Done card has no drag: a tap, a right click open its menu, as anywhere. */
	private attachDoneCard(card: HTMLElement, item: TaskItem, signal: AbortSignal): void {
		this.found.attach(card, item);
		this.arriving.attach(card, item);
		card.addEventListener(
			"click",
			(e) => {
				if (!this.fold(item, e.target)) this.showMenu(item, card);
			},
			{ signal },
		);
		card.addEventListener(
			"contextmenu",
			(e) => {
				e.preventDefault();
				this.showMenu(item, card);
			},
			{ signal },
		);
	}

	/** A tap on a card's subtask counter folds its open subtasks away, or shows them again; true when it did, in place of the menu. */
	private fold(item: TaskItem, target: EventTarget | null): boolean {
		if (!item.can.fold || !onCounter(target)) return false;
		this.haptics.tap();
		void this.act(() => this.deps.tasks.toggleCollapsed(item.key));
		return true;
	}

	/** `sheet`: the sheet of the window the search replaces, which it takes over. */
	private openSearch(sheet?: (onClose: (how: CloseHow) => void) => Overlay): void {
		if (this.search) return;
		void this.afterEntry(() => {
			this.search = SearchWindow.open({
				root: this.contentEl,
				tasks: this.deps.tasks,
				desktop: !this.contentEl.ownerDocument.body.classList.contains("is-mobile"),
				paths: this.data.funnel?.searchPaths ?? false,
				...(sheet && { sheet }),
				sectionName: (section) => this.deps.tasks.listName(section),
				onPick: (hit) => {
					this.search = null;
					void this.reveal(hit.item);
				},
				onClose: () => (this.search = null),
			});
		});
	}

	/**
	 * The screen goes where the found task stands, as the switch and the arrows would take it, and its card wears the ring:
	 * Done to its own place left of Inbox, Inbox and Backlog to Inbox and Soon, Soon to Soon and Now, a task of a day to
	 * that day beside its calendar. A found subtask's tasks show their subtasks, so its card is there.
	 */
	private async reveal(item: TaskItem): Promise<void> {
		const revealed: { screen?: TaskScreen } = {};
		await this.act(async () => {
			revealed.screen = await this.deps.tasks.reveal(item);
		});
		const { screen } = revealed;
		if (!screen) return;
		if (await this.deps.tasks.filterHides(item, this.filterNode())) await this.act(() => this.deps.tasks.clearProjectFilter());
		this.found.mark(item);
		const place: Place = screen.kind === "day" ? "calendar" : PLACE_OF_LIST[screen.list];
		if (place === "done" && !this.view().ribbon) return this.openFull(item, false);
		this.atDone = place === "done";
		if (screen.kind === "day" && screen.date !== this.selectedDate) this.select(screen.date);
		if (place === "done") this.switcher?.show("done");
		await this.setMode(place === "done" ? "inbox" : place);
		this.parts.request("tasks");
	}

	/** A tap anywhere but the selected card, its dots, or the menu over it lets the selection go. */
	private deselectUnless(target: EventTarget | null): void {
		if (!this.timeline?.selection) return;
		if (target instanceof Element && target.closest(".tc-block.is-selected, .tc-grips, .tc-lifted, .tc-panel, .tc-backdrop")) return;
		this.timeline.select(null);
	}

	/** Runs one change to the file and resolves once the screen shows it; a task changed under us is reported instead. */
	/** Runs a change of the tasks, then reads them anew; a change that answers false wrote nothing and needs no reading. */
	private async act(change: () => Promise<void | boolean>): Promise<void> {
		/** One change after another, in the order they were asked: a read after the second never sees the file before the first. */
		const run = this.changing.then(change);
		this.changing = run.catch(() => undefined);
		try {
			if ((await run) === false) return;
		} catch (error) {
			if (!(error instanceof StaleTaskError)) throw error;
			new Notice(failureText(error));
		}
		await this.data.tasks();
	}

	/** What scrolls the whole view in a note's block, which grows with it: its layout's. */
	scroller(): HTMLElement | null {
		return this.layout?.scroller() ?? null;
	}

	/** Cmd+F: the search over the screen. */
	findKey(): boolean {
		this.openSearch();
		return false;
	}

	/** Cmd+Z and Cmd+Shift+Z in the calendar; in a field they stay the field's, taking typing back. */
	undoKey(step: "undo" | "redo"): boolean {
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
		new Notice(failureText(error));
		void this.data.tasks();
	}

	/** The settings' levels at this screen's height, the whole day first; before the timeline has a height, the core's stand-in for the whole day. */
	private zoomLevels(): ZoomLevel[] {
		const levels = this.settings.zoomLevels;
		return levelsFor(zoomShown("wholeDay", this.wholeDayPx(), levels), levels);
	}

	/** The whole day's hour height, once the timeline is laid out. */
	private wholeDayPx(): number | null {
		return this.timeline?.wholeDayHourPx() ?? null;
	}

	/** The timeline opens at the zoom it was left at; the whole day takes its height once the timeline is laid out. */
	private restoreZoom(): void {
		const zoom = this.settings.zoom;
		this.wholeDay = zoom === "wholeDay";
		this.hourPx = zoomShown(zoom, this.wholeDayPx(), this.settings.zoomLevels);
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
		const zoom = zoomAfterPinch(hourPx, this.wholeDayPx(), this.settings.zoomLevels);
		this.wholeDay = zoom === "wholeDay";
		void this.deps.settings.set({ zoom });
	}

	/** What the screen shows, as places to drop: the tree while it shows, the layout's lists, the timeline where it shows. */
	private shownDrops(): (LayoutDrop | TimelineDrop | TreeDrop)[] {
		const layout = this.layout;
		if (!layout) return [];
		const panel = this.panel ? [this.treeDrop] : [];
		const timeline = layout.timelineShows() && this.timelineDrop ? [this.timelineDrop] : [];
		return [...panel, ...timeline, ...layout.drops()];
	}

	/** A list's card: its gestures. */
	private attachCard(card: HTMLElement, item: TaskItem, column: ListColumn, subtree: readonly HTMLElement[], signal: AbortSignal): void {
		this.found.attach(card, item);
		this.arriving.attach(card, item);
		this.bulk.attach({ item, card, column, subtree });
		this.drag.attachCard(card, item, column, subtree, signal);
	}

	/**
	 * A row of the Projects screen, a task's card or a subtask's: a tap opens its menu (its list's, `ProjectsCard.menuFrom`
	 * of the card it belongs to), its counter folds it, and an open task is carried onto the tree or among the tasks
	 * (`canDrop`), picked with others as a list card is.
	 */
	private attachProjectsCard(card: HTMLElement, row: ProjectsListRow, owner: ProjectsCard, subtree: readonly HTMLElement[], signal: AbortSignal): void {
		const item = row.item;
		card.dataset.menuFrom = owner.menuFrom;
		card.dataset.card = row.id;
		this.found.attach(card, item);
		if (owner.canDrop) {
			/** The drag's origin is only what the lists read; the Projects screen takes the row's own `drop`. An open task's card is of a list. */
			const column = owner.menuFrom as ListColumn;
			this.bulk.attach({ item, card, column, subtree });
			return this.drag.attachCard(card, item, column, subtree, signal);
		}
		card.addEventListener("click", (e) => {
			if (!this.fold(item, e.target)) this.showMenu(item, card);
		}, { signal });
	}

	/** What the core takes for the rows a drag carries on the Projects screen, as read at the lift. */
	private projectsDrops(drag: TaskDragPayload): readonly ProjectsDrop[] {
		return this.carry.dropsOf(drag);
	}

	/**
	 * A carry to a project starts (a card, several, or the plus lifted in the plugin's own view): the core keeps what it
	 * carries and the filter it was lifted under (`TaskService.startCarry`).
	 */
	private startCarry(start: CarryStart): void {
		this.carrying = true;
		this.carryReport.end();
		void this.deps.tasks.startCarry(start, this.wide()).catch((error: unknown) => this.reportFailure(error));
	}

	/** The carry ends (`TaskService.endCarry`): let go nowhere, the lift's filter is put back; the screen reads it again. */
	private endCarry(how: CarryEnd): Promise<void> | null {
		if (!this.carrying) return null;
		this.carrying = false;
		this.carryReport.end();
		return this.deps.tasks
			.endCarry(how)
			.then(() => this.endSelectionAfter(how))
			.then(() => this.data.tasks())
			.then(() => this.drawCarried())
			.catch((error: unknown) => this.reportFailure(error));
	}

	/** A carry that landed ends Select Tasks as the core says (`endsSelection`), however many it carried. */
	private endSelectionAfter(how: CarryEnd): void {
		if (endsSelection(how)) this.bulk.stop();
	}

	/** Cards let go on a row of the tree: every carried task gets the row's project (`TaskService.carryOnNode`). */
	private async dropOnTree(drag: TaskDragPayload, node: ProjectsNodeId): Promise<null> {
		this.carrying = false;
		this.carryReport.end();
		await this.act(() => this.deps.tasks.carryOnNode(node));
		this.endSelectionAfter("dropped");
		return null;
	}

	/**
	 * Cards let go between the Projects screen's cards: written as the core says (`dropInProjects`), and the card the one
	 * under the finger lands on (`projectsDropPreview`) hidden until the float is down on it.
	 */
	private async dropInProjectsList(drag: TaskDragPayload, place: ListPlace): Promise<HTMLElement | null> {
		const list = this.layout?.projects() ?? null;
		const node = this.filterNode() ?? "all";
		const cards = this.projectsDrops(drag);
		if (!list || cards.length === 0) return null;
		let landing: ProjectsDropLanding | null = null;
		await this.act(async () => {
			landing = (await this.deps.tasks.projectsDropPreview(cards, place, node)).landings[0] ?? null;
			await this.deps.tasks.dropInProjects(cards, place, node);
		});
		const card = landing ? list.cardOf(landing) : null;
		if (card) this.arriving.hold(card);
		return card;
	}

	/**
	 * The plus's places besides the funnel's lists: the tree while it shows (a new project; on the phone the core slides
	 * it out at the left edge), and in the by project mode the node's list alone, where the field opens as in any list. Its
	 * carry is the core's, as a card's. A tap is the entry's own (`QuickEntrySession.plusOpens`).
	 */
	private projectsPlus(): PlusAside | null {
		const plus = this.data.funnel?.plus;
		const tree = this.panel ? [this.treeDrop] : [];
		const aside = {
			started: () => this.startCarry({ keys: [], plus: true }),
			ended: (result: DropResult | null) => {
				if (result?.kind === "projectGap") return void this.newProject(result.gap, result.landing);
				void this.endCarry(result ? "dropped" : "nowhere");
			},
		};
		if (!plus) return null;
		/** Held, the plus goes into the funnel's lists, the node's by project list alone, or no list (`PlusChoice.list`). */
		const into = plus.list;
		const byProject = this.layout?.drops().find((drop) => drop instanceof ProjectsListDrop);
		const list = into === "projects" && byProject ? [byProject] : [];
		return { targets: [...tree, ...list], alone: into !== "funnel", ...aside };
	}

	/**
	 * The plus let go at a gap of the tree: the core keeps the panel out while the name is asked there (`endCarry("naming")`
	 * until `endProjectName`), then the project is made at that place and chosen.
	 */
	private async newProject(gap: number, landing: ProjectsLanding): Promise<void> {
		const panel = this.panel;
		await this.endCarry("naming");
		if (!panel || !this.arbiter.claim(NAMING)) return void (await this.endProjectName());
		const name = await panel.askProjectName(gap, landing.depth);
		this.arbiter.release(NAMING);
		if (name !== null) await this.act(async () => void (await this.deps.tasks.createProject(name, landing.place)));
		await this.endProjectName();
	}

	/** A new project's name typed or given up: the panel the naming held out goes. */
	private async endProjectName(): Promise<void> {
		await this.act(() => this.deps.tasks.endProjectName());
	}

	/** A drop: the service says what it means for the file (spec §5.1), for the card under the finger and those carried along. */
	/** The drop written and drawn: the card the dragged task stands on now, hidden until the float lands on it. */
	private async applyDrop(drag: TaskDragPayload, result: DropResult): Promise<HTMLElement | HeldOut | null> {
		/** Let go: the rows measure again as the drop is drawn, growing with the card that lands. */
		this.layout?.hold("carry", false);
		if (isProjectsDrop(result)) {
			if (result.kind === "projectRow") return this.dropOnTree(drag, result.node);
			if (result.kind !== "projectsPlace") return null;
			const card = await this.dropInProjectsList(drag, result.place);
			await this.endCarry("dropped");
			return card;
		}
		this.arriving.dropping(drag.item);
		await this.act(async () => void (await this.deps.tasks.drop(droppedTasks(drag), result, this.selectedDate, this.filterNode())));
		await this.endCarry("dropped");
		return this.arriving.shown;
	}

	/** The card waits at the end of its column under a field for the section's name; Enter makes the section, anything else puts it back. */
	private askGroupName(item: TaskItem, column: ListColumn): void {
		this.naming = { item, column };
		this.render();
		const slot = this.listOf(column)?.pendingSlot;
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
				if (name !== null) void this.act(() => this.deps.tasks.toSection([item.key], name));
				else this.render();
			},
		});
		field.scrollIntoView({ block: "nearest" });
	}

	/** A section's menu, with what the group may be given; none for a group that may be given nothing (No section). */
	private showGroupMenu(head: HTMLElement, list: GroupedList, group: ListGroup): void {
		const menu = group.menu;
		if (!menu || !(menu.rename || menu.remove)) return;
		const name = menu.section;
		GroupMenu.open(head, {
			name,
			onRename: menu.rename ? () => this.renameInPlace(head, list, name) : undefined,
			onRemove: menu.remove ? () => void this.act(() => this.deps.tasks.removeGroup(list, name)) : undefined,
		});
	}

	/** The name is edited where the header stands, the caret at its end. */
	private renameInPlace(head: HTMLElement, list: GroupedList, name: string): void {
		if (!this.arbiter.claim(NAMING)) return;
		const slot = el(null, "div", "tc-group-slot is-rename");
		head.before(slot);
		head.classList.add("is-renamed");
		GroupNameField.open(slot, {
			value: name,
			onDone: (to) => {
				slot.remove();
				head.classList.remove("is-renamed");
				this.arbiter.release(NAMING);
				if (to === null) return this.render();
				void this.act(async () => {
					if (!(await this.deps.tasks.renameGroup(list, name, to))) this.render();
				});
			},
		});
	}

	/** The groups of the list whose sections `column` shows, where its empty sections stand. */
	private listSectionsOf(column: ListColumn): readonly ListSection[] {
		const sections = this.sectionsOf(column);
		return sections ? this.data.sections[sections.list] : [];
	}

	/** A tap on a card's folder mark opens the Projects screen on the task's project, in place of its menu; true when it did. */
	private openProjectOf(item: TaskItem, target: EventTarget | null): boolean {
		const project = item.project;
		if (!onProjectMark(target) || !project) return false;
		void this.showProjectNode(projectNodeOf(project.name));
		return true;
	}

	/** The chosen project's menu, its title tapped (spec decision 1): Rename in place, Folder turned, its note attached, opened or detached. */
	private showProjectMenu(title: HTMLElement, filter: ProjectFilter): void {
		const menu = filter.menu;
		const shown = this.filterTitle;
		if (!menu || !shown || this.arbiter.busy) return;
		const name = menu.project.name;
		const tasks = this.deps.tasks;
		const changed = (write: () => Promise<unknown>) => void this.act(async () => void (await write()));
		ProjectMenu.open(title, {
			title: filter.title,
			renameLabel: menu.renameLabel,
			note: menu.note?.name ?? null,
			attachLabel: menu.attachLabel,
			detachLabel: menu.detachLabel,
			onRename: () => {
				if (!this.arbiter.claim(NAMING)) return;
				shown.editTitle((to) => {
					this.arbiter.release(NAMING);
					if (to === null) return this.drawView();
					changed(() => tasks.renameProject(name, to));
				});
			},
			onAttach: () => new NoteSearch(this.app, this.settings.tasksFile, (link) => changed(() => tasks.setProjectNote(name, link))).open(),
			onOpenNote: () => {
				if (menu.note) void this.app.workspace.openLinkText(menu.note.link, this.settings.tasksFile, "tab");
			},
			onDetach: () => changed(() => tasks.setProjectNote(name, null)),
			folder: menu.folder,
			onFolder: (on) => changed(() => tasks.setProjectFolder(name, on)),
			delete: menu.delete,
			onDelete: () => changed(() => tasks.deleteProject(name)),
		});
	}

	/** The funnel filtered by `node`: chosen, its branches above unfolded. */
	private async showProjectNode(node: ProjectsNodeId): Promise<void> {
		await this.act(() => this.deps.tasks.selectProjectNode(node));
	}

	/** Whose sections a column shows on the selected day (`TaskService.columnSections`). */
	private sectionsOf(column: ListColumn): ColumnSections | null {
		return this.deps.tasks.columnSections(column, this.selectedDate);
	}

	/** The list column a card stands in, if any. */
	private columnOf(card: HTMLElement): ListColumn | null {
		const columns: ListColumn[] = ["day", "soon", "inbox", "backlog"];
		return columns.find((c) => this.listOf(c)?.el.contains(card)) ?? null;
	}

	/** Where a card pressed for its menu stands: a timeline card's stack, the whole screen, the timeline, a list column, else Done. */
	private menuFrom(source: HTMLElement, full: FullScreen | undefined): MenuFrom {
		if (source.closest(".tc-menu-subtasks")) return "stack";
		const projectsFrom = source.closest(".tc-projects-list") ? source.dataset.menuFrom : undefined;
		if (projectsFrom) return projectsFrom as MenuFrom;
		if (full) return "full";
		if (source.classList.contains("tc-block")) return "timeline";
		return this.columnOf(source) ?? "done";
	}

	/** The screen a menu opens over (`TaskService.menu`). */
	private menuScreen(): MenuScreen {
		return { today: this.today(), day: this.selectedDate, offer: this.data.offer, projects: this.data.projectTree };
	}

	/** The list `column` is drawn in now: its column's, or in the rows mode its row's. */
	private listOf(column: ListColumn): TaskList | null {
		return this.layout?.listOf(column) ?? null;
	}

	/** The lists leave out the card waiting for its section's name; its own list draws it last. */
	private unnamed(items: readonly TaskItem[]): readonly TaskItem[] {
		const naming = this.naming;
		if (!naming) return items;
		return items.filter((item) => !sameTaskTree(item.key, naming.item.key));
	}

	private namingIn(column: ListColumn): TaskItem | null {
		return this.naming?.column === column ? this.naming.item : null;
	}

	private showSources(anchor: HTMLElement): void {
		SourcesPopover.open({ anchor, statuses: this.data.statuses, words: this.data.words, onRefresh: () => this.refreshNow() });
	}

	private refreshNow(): Promise<void> {
		return this.poll?.refreshNow() ?? Promise.resolve();
	}

	/** Descriptions are drawn and edited by Obsidian itself, their links made from the tasks file. */
	private readonly markdown = new ObsidianMarkdown(this.app, this, () => this.settings.tasksFile, (link) => this.openLink(link), this.where.keys);

	/** The task over the whole view; one already open there takes it in over its own. `editing` puts the caret in its description. */
	private openFull(item: TaskItem, editing: boolean): void {
		if (this.full) {
			this.full.show(item, editing);
			return;
		}
		this.full = FullScreen.open(
			{
				root: this.contentEl,
				tasks: this.deps.tasks,
				undo: this.deps.undo,
				surface: this.markdown,
				titleField: (parent, opts) => new MarkdownTitleField(this.app, this, this.settings.tasksFile, parent, opts, this.where.keys),
				day: () => this.today(),
				act: (change) => this.act(change),
				onUndo: () => void this.undoStep("undo"),
				menu: (task, source) => {
					if (this.full) this.showMenu(task, source, source.classList.contains("tc-card") ? (copy) => FullScreen.mark(copy, task) : undefined, this.full);
				},
				onClose: () => (this.full = null),
				openProject: (name) => {
					this.full?.close();
					void this.showProjectNode(projectNodeOf(name));
				},
				onError: (error) => this.reportFailure(error),
			},
			item,
			editing,
		);
	}

	/**
	 * The task menu; a list card's offers the sections of its list too. On the whole screen, typing and opening stay there.
	 */
	private showMenu(item: TaskItem, source: HTMLElement, lifted?: (copy: HTMLElement, close: () => void) => void, full?: FullScreen, held?: boolean, sheet?: Sheet): TaskMenu {
		const tasks = this.deps.tasks;
		const from = this.menuFrom(source, full);
		const column = this.columnOf(source);
		const screen = this.menuScreen();
		const today = screen.today;
		/** The task as the menu last saw it: a label set from the menu gives it a fresh key, which the next action needs. */
		let current = item;
		return TaskMenu.open({
			item,
			source,
			lifted,
			held,
			sheet,
			menu: (task) => tasks.menu(task, from, screen),
			onSubtask: (subtask, card, taken) => this.showMenu(subtask, card, undefined, undefined, undefined, taken),
			markdown: full?.holds(item) ? undefined : this.markdown,
			today,
			day: this.selectedDate,
			actions: {
				pickStatus: (id) => this.act(() => tasks.pickStatus([current.key], id)),
				postpone: (date) => this.act(() => tasks.postpone(current.key, date)),
				removeDue: () => this.act(() => tasks.removeDue([current.key])),
				toSection: (name) => this.act(() => tasks.toSection([current.key], name)),
				newSection: () => {
					if (column) this.askGroupName(current, column);
				},
				setProject: (project) => this.act(() => tasks.setProject([current.key], project)),
				newProject: (name) => this.act(async () => (await tasks.newProject(name, [current.key])) !== null),
				toggleProject: async (name) => {
					const [written] = await this.toggleProject([current], name);
					if (written) current = written;
					return written ?? null;
				},
				togglePriority: (prefix) => this.act(() => tasks.togglePriority([current.key], prefix)),
				toggleLabel: async (name) => {
					const written: { item: TaskItem | null } = { item: null };
					await this.act(async () => {
						[written.item] = await tasks.toggleLabel([current.key], name);
					});
					if (written.item) current = written.item;
					return written.item;
				},
				setReminder: (kind) => this.act(() => tasks.setReminder(current.key, kind)),
				setRepeat: (rule) => this.act(() => tasks.setRepeat(current.key, rule)),
				rename: (menu) => (full ? full.rename(current) : this.quick?.rename(current, menu)),
				openDescription: (editing) => this.openFull(current, editing),
				openFull: full?.holds(current) ? undefined : () => this.openFull(current, false),
				addSubtask: (menu) => (full ? full.addSubtask(current) : this.quick?.addSubtask(current, menu)),
				remove: () => this.act(() => tasks.remove(current.key)),
				openInObsidian: () => void this.openInObsidian(current),
				openLink: (link) => this.openLink(link),
			},
		});
	}

	/** A project of the Project page toggled on `items`: each task as it then stands, null for one gone. */
	private async toggleProject(items: readonly TaskItem[], name: string): Promise<readonly (TaskItem | null)[]> {
		let written: readonly (TaskItem | null)[] = items.map(() => null);
		await this.act(async () => {
			written = await this.deps.tasks.toggleProject(items.map((item) => item.key), name);
		});
		return written;
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

	/** The view the screen draws: the funnel's as this device shows it, or a note's block fixed to its project. */
	private readView(): Promise<FunnelView | null> {
		const note = this.where.note;
		return note ? this.deps.tasks.projectNoteView(note(), this.wide()) : this.deps.tasks.funnelView(this.wide());
	}

	/** The host's screen is wide: the desktop, where the panel docks and All columns is offered. */
	private wide(): boolean {
		return !this.contentEl.ownerDocument.body.classList.contains("is-mobile");
	}

	/** The view as read with the lists; before the first read, as the device keeps it (`TaskService.firstView`). */
	private view(): ViewChoice {
		return this.data.funnel?.view ?? (this.firstView ??= this.deps.tasks.firstView(this.wide(), this.where.note !== undefined));
	}

	/** The node the funnel is filtered by; null for none. */
	private filterNode(): ProjectsNodeId | null {
		return this.data.funnel?.filter?.node ?? null;
	}

	/** The lists the screen shows, in its order: where the quick entry looks for a task first. */
	private shownLists(): readonly EntryList[] {
		return viewEntryLists(this.view().mode, this.place());
	}

	/** The panel shows: opened by the button, or slid out by a held card. */
	private treeShows(): boolean {
		return this.panel !== null && (this.data.funnel?.panel?.open ?? false);
	}

	/**
	 * The view's frame as the core reads it: the mode's layout, the top row (the projects button, the filter's name), the
	 * panel docked or over the lists, the wheel or the view button alone.
	 */
	private drawView(): void {
		const root = this.contentEl;
		const funnel = this.data.funnel;
		const filter = funnel?.filter ?? null;
		const panel = funnel?.panel ?? null;
		const main = this.where.view;
		root.classList.toggle("is-note", this.where.note !== undefined);
		root.classList.toggle("has-wheel", this.view().wheel);
		const topRow = funnel?.topRow ?? false;
		root.classList.toggle("has-top-row", topRow);
		root.classList.toggle("has-head-lead", main && !topRow);
		this.dock(this.panel !== null && (panel?.open ?? false) && (panel?.docked ?? false));
		root.classList.toggle("has-tree", this.treeShows());
		this.folder?.setOn(this.treeShows());
		this.filterTitle?.render(main ? filter : null);
		if (panel) this.panel?.render(panel);
		this.treeDrop.refill();
		this.viewButton?.render(funnel?.view ?? null);
	}

	/**
	 * The docked panel (desktop) stands or goes: after the first drawing it slides in or out, and every column moves and
	 * takes its new width with it in the same motion (`is-docking` for the slide's duration).
	 */
	private dock(docked: boolean): void {
		const root = this.contentEl;
		if (root.classList.contains("has-dock") === docked) return;
		if (this.drawnRead) {
			window.clearTimeout(this.docking);
			root.classList.add(DOCKING);
			this.docking = window.setTimeout(() => root.classList.remove(DOCKING), tokenMs(root, DURATION.slide));
		}
		root.classList.toggle("has-dock", docked);
	}

	/**
	 * The screen while a carry holds it: the frame follows at once; when the held card opened another node (or the carry
	 * put the lift's back), that context's lists are drawn now, still, so the card is let go among the tasks it sees.
	 */
	private drawCarried(): void {
		if (this.view().context !== this.drawnContext) this.draw(new Set<ScreenPart>(["frame", "tasks"]));
		else this.drawView();
	}

	/** The projects button: the panel opened or closed, kept on the device. */
	private togglePanel(): void {
		const open = this.data.funnel?.panel?.open ?? false;
		void this.act(() => this.deps.tasks.setProjectsPanel(!open));
	}

	/** A mode picked in the view button's menu: kept for this view (a note's block keeps its own). */
	private async pickView(mode: ViewMode): Promise<void> {
		await this.afterEntry(() => this.act(() => (this.where.note ? this.deps.tasks.setNoteViewMode(mode) : this.deps.tasks.setViewMode(mode))));
	}

	/** The day's name, as the header over the day's list says it: the one a swipe has drawn nearer while it does. */
	private dayName(): string {
		const day = this.titleDay ?? this.selectedDate;
		return dayTitle(day, this.deps.days.relation(day), this.today());
	}

	/** The tasks of a funnel's list as read. */
	private itemsOf(column: DropColumn): readonly TaskItem[] {
		return { day: this.data.day?.list ?? [], inbox: this.data.inbox, backlog: this.data.backlog, soon: this.data.soon }[column];
	}

	/** The by project mode's list, built in `area` by its layout: the node's tasks in its projects' parts, its cards a place to drop, as a list's. */
	private buildByProject(area: HTMLElement): { readonly list: ProjectTasks; readonly drop: ProjectsListDrop } {
		const list = new ProjectTasks(area, {
			onCard: (card, row, owner, subtree, signal) => this.attachProjectsCard(card, row, owner, subtree, signal),
			onPlate: (plate, group, signal) => plate.addEventListener("click", () => this.quick?.openIn("projects", group), { signal }),
			entry: (drawing) => this.quick?.entryIn("projects", drawing) ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			coming: () => this.data.projects,
		});
		const drop = new ProjectsListDrop(
			list,
			area,
			{
				reorders: () => this.data.projects?.reorders ?? false,
				takesAt: (place, drag) => {
					const view = this.data.projects;
					if (view === null) return false;
					/** A place read off cards another read has since replaced is no place: the next drawing brings the right ones. */
					try {
						return projectsTakes(view, this.projectsDrops(drag), place);
					} catch (error) {
						if (error instanceof StaleTaskError) return false;
						throw error;
					}
				},
				plusTakesAt: (place) => {
					const view = this.data.projects;
					return view !== null && projectsPlusTakes(view, place);
				},
				node: () => this.data.projects?.selected ?? null,
			},
			() => this.haptics.tap(),
		);
		return { list, drop };
	}

	/** The projects button, the filter's name and the tree's panel: the plugin's own view only, not a note's block. */
	private buildPanel(root: HTMLElement): void {
		if (!this.where.view || this.where.note) return;
		this.folder = Button.create(root, { kind: "icon", tone: "quiet", label: "Projects", icon: "project", cls: "tc-folder-btn", onPress: () => this.togglePanel() });
		this.filterTitle = new FilterTitle(root, {
			onMenu: (title, filter) => this.showProjectMenu(title, filter),
			onClear: () => void this.afterEntry(() => this.act(() => this.deps.tasks.clearProjectFilter())),
		});
		/** A project of the tree held and carried to another place in it. */
		const treeLift = new TreeLift({
			arbiter: this.arbiter,
			haptics: this.haptics,
			longPressMs: () => this.settings.longPressMs,
			tree: () => (this.treeShows() ? (this.panel?.treeShown ?? null) : null),
			onMove: (name, place) => void this.act(() => this.deps.tasks.moveProject(name, place)),
		});
		this.panel = new TreePanel(root, {
			arbiter: this.arbiter,
			treeWidth: () => this.settings.treeWidth,
			onWidth: () => this.layout?.frame(),
			setTreeWidth: (width) => void this.deps.settings.set({ treeWidth: width }).then(() => this.parts.request("frame")),
			onSnap: () => this.haptics.tap(),
			onPick: (node) => void this.afterEntry(() => this.act(() => this.deps.tasks.pickProjectNode(node, this.wide()))),
			onClose: () => {
				if (this.data.funnel?.panel?.dimCloses) void this.act(() => this.deps.tasks.setProjectsPanel(false));
			},
			onRow: (row, model, signal) => treeLift.attach(row, model, signal),
		});
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
		if (!this.dayNav || !this.switcher || !this.rightEl || !this.allDayEl || !this.timeline || !this.layout) return;
		const view = this.view();
		if (view.layout.mode !== this.layout.mode) this.mount(view);
		const layout = this.layout;
		if (parts.has("frame") || parts.has("tasks")) {
			this.drawView();
			layout.frame();
			this.dayNav.render();
			layout.showPlace(this.place(), false);
		}
		this.switcher.render();
		let motion: LayoutMotion = "replace";
		if (parts.has("tasks")) {
			this.bulk.selection.forgetDrawn();
			motion = this.drawnRead && this.drawnContext === view.context ? "move" : "replace";
			this.drawnRead = this.data.read;
			this.drawnContext = view.context;
			const missing = this.data.missing;
			root.classList.toggle("is-missing", missing);
			layout.hide(missing);
			this.rightEl.classList.toggle("tc-hidden", missing);
			root.querySelector(".tc-missing")?.remove();
			if (missing) this.renderMissing(root);
			root.classList.toggle(REDRAWN, motion === "replace");
			/** A field about to open holds the rows as they stand before they draw it, where they share the room. */
			layout.hold("typing", this.quick?.entering ?? false);
			layout.render(motion);
		}
		const hoursAt = this.landing?.peek.date === this.selectedDate ? { top: this.timeline.el.getBoundingClientRect().top, scroll: this.timeline.el.scrollTop } : null;
		if (parts.has("events")) renderAllDayRows(this.allDayEl, this.rightEl, this.data.allDay, this.theme(), (event) => this.deps.calendars.isPast(event));
		if (parts.has("tasks") || parts.has("events")) this.timeline.render(parts.has("tasks") ? motion === "move" : this.drawnRead);
		if (hoursAt !== null) this.keepHoursAt(hoursAt);
		if (parts.has("tasks") && this.scrolledFor !== this.selectedDate) {
			this.scrolledFor = this.selectedDate;
			this.scrollToOpen(this.timeline, this.selectedDate);
		}
		if (this.landing?.peek.date === this.selectedDate && (this.data.missing || this.data.day?.date === this.selectedDate)) this.landed();
		this.quick?.rendered();
		layout.hold("typing", this.quick?.entering ?? false);
		if (root.classList.contains(REDRAWN)) {
			void root.offsetHeight;
			root.classList.remove(REDRAWN);
		}
	}

	/**
	 * The day a swipe brought in may end sooner, or have more or fewer rows of all-day events, than the one it replaced:
	 * the timeline keeps its scroll, moved by as much as the rows push it, so the hours stay where they stood.
	 */
	private keepHoursAt(at: { readonly top: number; readonly scroll: number }): void {
		if (!this.timeline) return;
		this.timeline.holdScroll(at.scroll + this.timeline.el.getBoundingClientRect().top - at.top);
	}

	/** The timeline opens where the day service says: on the now line, held at its fraction of the height, or at an hour, at the top. */
	private scrollToOpen(timeline: Timeline, date: LocalDate): void {
		const open = this.deps.days.openAt(date);
		timeline.scrollTo(open.minute, open.kind === "now" ? LAYOUT.nowFraction : 0);
	}

	private renderMissing(root: HTMLElement): void {
		const box = el(root, "div", "tc-missing");
		el(box, "div", "", `No tasks file at ${this.settings.tasksFile}`);
		Button.create(box, { kind: "pill", label: "Create file", cls: "tc-missing-btn", onPress: () => void this.act(() => this.deps.tasks.createFile()) });
	}

}

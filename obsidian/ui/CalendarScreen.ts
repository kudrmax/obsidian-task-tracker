import { type App, Component, MarkdownView, Notice, Platform, type Scope } from "obsidian";
import { acceptsDrop, LIST_WIDTHS, type CalendarEvent, type CalendarPoll, type CalendarService, type DayBoundary, type DayChange, type DayService, type GroupedList, type ListGroup, type ListSection, type MenuFrom, projectNodeOf, type ProjectsCard, type ProjectsDrop, type ProjectsDropLanding, type ProjectsLanding, type ProjectsListRow, type ListPlace, projectsTakes, type ProjectsNewTask, type ProjectsView, type MenuScreen, sameTaskTree, StaleTaskError, type TaskItem, type TaskScreen, type TaskService, type UndoService, type Clock, type ZoomLevel } from "../../core/application/contracts";
import { type RightMode, type ShownSettings, type ShownSettingsStore } from "./viewSettings";
import { renderAllDayRows } from "./AllDayRow";
import { BottomCapsule } from "./BottomCapsule";
import { FoundCard } from "./FoundCard";
import { ArrivingCard } from "./drag/ArrivingCard";
import { SearchWindow } from "./search/SearchWindow";
import { BulkController } from "./BulkController";
import type { Theme } from "./eventColors";
import { DayData } from "./DayData";
import { ColumnHeaders } from "./ColumnHeaders";
import { ColumnSwitch } from "./ColumnSwitch";
import { DragController } from "./drag/DragController";
import { type ColumnTitle, ListDrop } from "./drag/ListDrop";
import { type ColumnSections, type DropResult, droppedTasks, type HeldOut, isProjectsDrop, type ListColumn, type TaskDragPayload } from "./drag/DropTarget";
import { GroupDrag } from "./drag/GroupDrag";
import { GroupMenu, ProjectMenu } from "./menu/GroupMenu";
import { NoteSearch } from "./projects/NoteSearch";
import { ProjectsListDrop, TasksDrop, TreeDrop } from "./projects/ProjectDrops";
import { ProjectsCarry } from "./projects/ProjectsCarry";
import { ProjectsChoices } from "./projects/ProjectsChoices";
import { TreeLift } from "./projects/TreeLift";
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
import { Divider } from "./Divider";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "./listWidth";
import { clear, el, px } from "./dom";
import { Button } from "./kit/Button";
import { FreeRoomDoubleClick } from "./FreeRoomDoubleClick";
import { Keyboard } from "./Keyboard";
import { PinchZoom, type ZoomAnchor } from "./PinchZoom";
import { type ScreenPart, ScreenParts } from "./ScreenParts";
import { settingsEffect } from "./settingsEffect";
import { StatusBarRoom } from "./StatusBarRoom";
import { type Place, type Shift } from "./screens";
import { ProjectsScreen } from "./projects/ProjectsScreen";
import { Swipe, swipeStartsAt } from "./Swipe";
import { DayPeek } from "./DayPeek";
import { ScreenPager, type ScreenTrack } from "./ScreenPager";
import { type DayLane, DayTrack, EdgeTrack, edgeParts, restore, StripTrack } from "./ScreenTracks";
import { cardMenuTask, onCounter, onProjectMark } from "./TaskCard";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate } from "./types";

const MINUTE_MS = 60_000;
/** The place of the screens a list stands at: Backlog under Inbox, Done left of it. */
const PLACE_OF_LIST: Readonly<Record<Extract<TaskScreen, { kind: "list" }>["list"], Place>> = { done: "done", inbox: "inbox", backlog: "inbox", soon: "soon" };

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
	private headers: ColumnHeaders | null = null;
	private switcher: ColumnSwitch | null = null;
	/** The Projects screen, left of Inbox: in the plugin's own view, once the core gives its data. */
	private projects: ProjectsScreen | null = null;
	/** The tree of the Projects screen as a place for a card or the plus, and its tasks as a place for the plus. */
	private readonly treeDrop = new TreeDrop({
		tree: () => this.projects?.treeShown ?? null,
		hover: (node) => this.choices.hover(node),
	});
	private readonly tasksDrop = new TasksDrop(() => this.projects?.tasksShown ?? null);
	/** The Projects screen's tasks as a list a card is dropped in, as a list column is. */
	private projectsListDrop: ProjectsListDrop | null = null;
	/** The rows each drag from the Projects screen carries and the node it was lifted on, read at the lift. */
	/** The nodes a held card chooses, one after another, each drawn before the next. */
	private readonly choices = new ProjectsChoices({
		hover: (node) => this.deps.tasks.hoverProjectNode(node),
		select: (node) => this.deps.tasks.selectProjectNode(node),
		refresh: async () => this.projects?.refresh(),
		selected: () => this.projects?.shown?.selected ?? null,
		onError: (error) => this.reportFailure(error),
	});
	private readonly carry = new ProjectsCarry({
		rowOf: (card) => this.projects?.tasksList.rowOf(card),
		selected: () => this.projects?.shown?.selected ?? null,
		carried: (item) => this.bulk.carried(item),
	});
	private leftEl: HTMLElement | null = null;
	private list: TaskList | null = null;
	private soonEl: HTMLElement | null = null;
	private soonList: TaskList | null = null;
	private soonDrop: ListDrop | null = null;
	private inboxEl: HTMLElement | null = null;
	private doneEl: HTMLElement | null = null;
	private doneList: TaskList | null = null;
	/** The window stands at Done, left of Inbox: only the search brings it there, and any other move leaves it. */
	private atDone = false;
	private search: SearchWindow | null = null;
	/** The task on the whole screen, while one is. */
	private full: FullScreen | null = null;
	private readonly found = new FoundCard();
	private readonly arriving = new ArrivingCard();
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
	private leftDrop: ListDrop | null = null;
	private timelineDrop: TimelineDrop | null = null;
	private zoomFrame = 0;
	/** The pinch settled on the whole day: it keeps fitting as the timeline's height changes. */
	private wholeDay = false;
	private readonly groupDrag: GroupDrag;
	/** A card sent to New section, waiting at the end of its column for the section's name. */
	private naming: { readonly item: TaskItem; readonly column: ListColumn } | null = null;
	private switching = 0;
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
		this.data = new DayData({ tasks: deps.tasks, calendars: deps.calendars, date: () => this.selectedDate, onUpdate: (part) => this.parts.request(part) });
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
			cards: (picked) => (this.projects?.tasksList.rowOf(picked.card) ? this.projects.tasksList.cards : (this.listOf(picked.column)?.cards ?? [])).map((entry) => entry.card),
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
			},
			onResult: (drag, result) => this.applyDrop(drag, result),
			onLift: (drag, source) => this.carry.lift(drag, source),
			putBack: (drag) => this.choices.backTo(this.carry.liftedOn(drag)),
			stretch: (item, edge, minute) => this.deps.tasks.stretch(item, this.selectedDate, edge, minute),
			onResize: async (item, edge, minute, minDurationMin) => {
				let written = false;
				await this.act(async () => (written = await this.deps.tasks.resize(item.key, this.selectedDate, edge, minute, minDurationMin)));
				return written;
			},
			onMenu: (item, source, lifted, held, drawn) => this.showMenu(item, source, lifted, undefined, held, undefined, drawn),
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
		this.restoreZoom();
		this.fitListWidth();
		this.headers = new ColumnHeaders(root, {
			title: () => {
				const day = this.titleDay ?? this.selectedDate;
				return dayTitle(day, this.deps.days.relation(day), this.today());
			},
			onStep: (days) => this.turnDay(() => ({ date: this.deps.days.step(this.selectedDate, days), shift: days < 0 ? -1 : 1 })),
			onToday: () => this.turnDay(() => (this.deps.days.relation(this.selectedDate) === "today" ? null : { date: this.today(), shift: this.selectedDate < this.today() ? 1 : -1 })),
			inboxName: () => this.deps.tasks.listName("inbox"),
			soonName: () => this.deps.tasks.listName("soon"),
			doneName: () => this.deps.tasks.listName("done"),
		});
		this.leftEl = el(root, "div", "tc-left");
		this.list = new TaskList(el(this.leftEl, "div"), {
			items: () => this.unnamed(this.data.day?.list ?? []),
			day: () => this.selectedDate,
			grouped: () => this.sectionsOf("day") !== null,
			sections: () => this.listSectionsOf("day"),
			onPlate: (plate, group, signal) => this.attachPlate(plate, "day", group, signal),
			pending: () => this.namingIn("day"),
			entry: (drawing) => this.quick?.entryIn("day", drawing) ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group, signal) => this.groupDrag.attach(head, this.sectionsOf("day")?.list ?? "now", this.list!, group, signal),
			ungroupedName: () => this.settings.ungrouped,
			onCard: (card, item, subtree, signal) => this.attachCard(card, item, "day", subtree, signal),
		});
		this.leftDrop = new ListDrop(this.list, this.leftEl, "day", (origins) => acceptsDrop("day", origins), () => this.sectionsOf("day"), true, () => this.haptics.tap(), this.columnTitle("day"));
		this.doneEl = el(root, "div", "tc-done");
		this.doneList = new TaskList(el(this.doneEl, "div"), {
			items: () => this.data.done,
			day: () => null,
			onCard: (card, item, _subtree, signal) => this.attachDoneCard(card, item, signal),
		});
		el(el(root, "div", "tc-divider is-fixed is-done"), "div", "tc-divider-line");
		this.inboxEl = el(root, "div", "tc-inbox");
		const inboxPane = el(this.inboxEl, "div", "tc-pane is-inbox");
		const backlogPane = el(this.inboxEl, "div", "tc-pane is-backlog");
		this.inboxList = new TaskList(el(inboxPane, "div"), {
			items: () => this.unnamed(this.data.inbox),
			day: () => null,
			grouped: () => this.sectionsOf("inbox") !== null,
			sections: () => this.listSectionsOf("inbox"),
			onPlate: (plate, group, signal) => this.attachPlate(plate, "inbox", group, signal),
			pending: () => this.namingIn("inbox"),
			entry: (drawing) => this.quick?.entryIn("inbox", drawing) ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group, signal) => this.groupDrag.attach(head, "inbox", this.inboxList!, group, signal),
			ungroupedName: () => this.settings.ungrouped,
			onCard: (card, item, subtree, signal) => this.attachCard(card, item, "inbox", subtree, signal),
		});
		this.inboxDrop = new ListDrop(this.inboxList, inboxPane, "inbox", (origins) => acceptsDrop("inbox", origins), () => this.sectionsOf("inbox"), true, () => this.haptics.tap(), this.columnTitle("inbox"));
		this.backlogTitle = el(el(backlogPane, "div", "tc-pane-head"), "div", "tc-head-title");
		this.backlogList = new TaskList(el(backlogPane, "div"), {
			items: () => this.unnamed(this.data.backlog),
			day: () => null,
			grouped: () => this.sectionsOf("backlog") !== null,
			sections: () => this.listSectionsOf("backlog"),
			onPlate: (plate, group, signal) => this.attachPlate(plate, "backlog", group, signal),
			pending: () => this.namingIn("backlog"),
			entry: (drawing) => this.quick?.entryIn("backlog", drawing) ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group, signal) => this.groupDrag.attach(head, "backlog", this.backlogList!, group, signal),
			ungroupedName: () => this.settings.ungrouped,
			onCard: (card, item, subtree, signal) => this.attachCard(card, item, "backlog", subtree, signal),
		});
		this.backlogDrop = new ListDrop(this.backlogList, backlogPane, "backlog", (origins) => acceptsDrop("backlog", origins), () => this.sectionsOf("backlog"), false, () => this.haptics.tap(), this.columnTitle("backlog"));
		this.soonEl = el(root, "div", "tc-soon");
		this.soonList = new TaskList(el(this.soonEl, "div"), {
			items: () => this.unnamed(this.data.soon),
			day: () => null,
			grouped: () => this.sectionsOf("soon") !== null,
			sections: () => this.listSectionsOf("soon"),
			onPlate: (plate, group, signal) => this.attachPlate(plate, "soon", group, signal),
			pending: () => this.namingIn("soon"),
			entry: (drawing) => this.quick?.entryIn("soon", drawing) ?? null,
			renaming: () => this.quick?.renaming() ?? null,
			onHeader: (head, group, signal) => this.groupDrag.attach(head, "soon", this.soonList!, group, signal),
			ungroupedName: () => this.settings.ungrouped,
			onCard: (card, item, subtree, signal) => this.attachCard(card, item, "soon", subtree, signal),
		});
		this.soonDrop = new ListDrop(this.soonList, this.soonEl, "soon", (origins) => acceptsDrop("soon", origins), () => this.sectionsOf("soon"), true, () => this.haptics.tap(), this.columnTitle("soon"));
		/** A project of the tree held and carried to another place in it. */
		const treeLift = new TreeLift({
			arbiter: this.arbiter,
			haptics: this.haptics,
			longPressMs: () => this.settings.longPressMs,
			tree: () => this.projects?.treeShown ?? null,
			onMove: (name, place) => void this.act(() => this.deps.tasks.moveProject(name, place)).then(() => this.projects?.refresh()),
		});
		if (this.where.view)
			this.projects = new ProjectsScreen(root, {
				source: this.deps.tasks,
				arbiter: this.arbiter,
				treeWidth: () => this.settings.treeWidth,
				setTreeWidth: (width) => void this.deps.settings.set({ treeWidth: width }),
				onSnap: () => this.haptics.tap(),
				onMenu: (title, view) => this.showProjectMenu(title, view),
				onCard: (card, row, owner, subtree, signal) => this.attachProjectsCard(card, row, owner, subtree, signal),
				onPlate: (plate, newTask, signal) => plate.addEventListener("click", () => void this.newProjectsTask(newTask, plate), { signal }),
				onRow: (row, model, signal) => treeLift.attach(row, model, signal),
				onError: (error) => this.reportFailure(error),
			});
		if (this.projects) {
			const projects = this.projects;
			this.projectsListDrop = new ProjectsListDrop(projects.tasksList, projects.tasksList.el.parentElement!, {
				reorders: () => !this.choices.choosing && (projects.shown?.reorders ?? false),
				takesAt: (place, drag) => {
					const view = projects.shown;
					return view !== null && projectsTakes(view, this.projectsDrops(drag), place);
				},
				node: () => projects.shown?.selected ?? null,
			});
		}
		el(el(root, "div", "tc-divider is-fixed is-inbox"), "div", "tc-divider-line");
		el(el(root, "div", "tc-divider is-fixed"), "div", "tc-divider-line");
		new Divider(el(root, "div"), {
			width: () => shownListWidth(this.settings.listShare, root.clientWidth),
			onWidth: (width) => root.style.setProperty(PROPERTY.listWidth, px(width)),
			onRelease: (width) => void this.deps.settings.set({ listShare: listShareOf(width, root.clientWidth) }).then(() => this.parts.request("frame")),
			min: LIST_WIDTHS.min,
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
		el(root, "div", "tc-fade");
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
		new FreeRoomDoubleClick([this.leftEl, this.list.el], () => this.quick?.openAtEnd("day"));
		new FreeRoomDoubleClick([this.soonEl, this.soonList.el], () => this.quick?.openAtEnd("soon"));
		new FreeRoomDoubleClick([inboxPane, this.inboxList.el], () => this.quick?.openAtEnd("inbox"));
		new FreeRoomDoubleClick([backlogPane, this.backlogList.el], () => this.quick?.openAtEnd("backlog"));
		const switcher = new ColumnSwitch(root, {
			value: () => this.place(),
			onChange: (mode) => void this.afterEntry(() => this.leaveDone(mode)),
			dot: () => ({ alert: this.data.alert, words: this.data.words.alert }),
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
			titleField: (parent, opts) => new MarkdownTitleField(this.app, this, this.settings.tasksFile, parent, opts, this.where.keys),
			list: (column) => this.listOf(column),
			sectioned: (column) => this.sectionsOf(column) !== null,
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
		this.unsubscribe.push(() => keyboard.destroy());
		if (this.where.view) {
			const capsule = new BottomCapsule(root, this.deps.undo, {
				onUndo: () => void this.undoStep("undo"),
				onMore: (anchor) => MoreMenu.open({ anchor, onSearch: (sheet) => this.openSearch(sheet), onSelect: () => this.bulk.start() }),
			});
			this.unsubscribe.push(() => capsule.destroy());
		}
		this.bulk.mount();
		const pager = new ScreenPager({ track: (shift) => this.trackTo(shift), duration: () => tokenMs(root, DURATION.slide), width: () => root.clientWidth });
		this.pager = pager;
		new Swipe(root, {
			arbiter: this.arbiter,
			accepts: swipeStartsAt,
			target: pager,
		});
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
		for (const list of [this.list, this.inboxList, this.backlogList, this.soonList, this.doneList]) list?.destroy();
		this.full?.close();
		this.quick?.close();
		this.poll?.stop();
		this.timeline?.destroy();
		this.unsubscribe.splice(0).forEach((off) => off());
	}

	resize(): void {
		this.fitListWidth();
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
		const from = { mode: this.place(), date: this.selectedDate };
		const to = this.deps.days.stepScreen(from, shift);
		if (!to) return new EdgeTrack(edgeParts(root, from.mode), root.clientWidth);
		if (to.mode !== from.mode) {
			window.clearTimeout(this.switching);
			root.classList.remove("is-switching");
			return new StripTrack({
				root,
				from: from.mode,
				to: to.mode,
				showMode: (place) => this.showPlace(place),
				turnWheel: (position) => this.switcher?.follow(position),
				onArrive: (mode) => this.arriveAt(mode),
			});
		}
		return this.dayTrack(to.date, shift);
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
		});
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
				this.titleDay = nearer ? day : null;
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

	/** The strip stands at the place a swipe brought it to: the switch turns there, and the choice is saved. Done is left behind. */
	private arriveAt(place: Place): void {
		if (place === "done") return;
		this.atDone = false;
		this.shownMode = place;
		this.showPlace(place);
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
		const root = this.contentEl;
		if (slide) {
			window.clearTimeout(this.switching);
			root.classList.add("is-switching");
			this.switching = window.setTimeout(() => root.classList.remove("is-switching"), tokenMs(root, DURATION.slide));
		}
		this.shownMode = mode;
		this.showPlace(this.place());
		await this.deps.settings.set({ rightMode: mode });
		if (this.shownMode === mode) this.shownMode = null;
		this.parts.request("frame");
	}

	private showPlace(place: Place): void {
		this.contentEl.classList.toggle("is-lists", place === "soon");
		this.contentEl.classList.toggle("is-inbox", place === "inbox" || place === "done" || place === "projects");
		this.contentEl.classList.toggle("is-done", place === "done");
		this.contentEl.classList.toggle("is-projects", place === "projects");
	}

	/** A Done card has no drag: a tap, a right click open its menu, as anywhere. */
	private attachDoneCard(card: HTMLElement, item: TaskItem, signal: AbortSignal): void {
		this.found.attach(card, item);
		this.arriving.attach(card, item);
		card.addEventListener(
			"click",
			(e) => {
				if (!this.fold(item, e.target)) this.showMenu(cardMenuTask(item, e.target), card, undefined, undefined, undefined, undefined, item);
			},
			{ signal },
		);
		card.addEventListener(
			"contextmenu",
			(e) => {
				e.preventDefault();
				this.showMenu(cardMenuTask(item, e.target), card, undefined, undefined, undefined, undefined, item);
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
				paths: this.mode() === "projects",
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
		this.found.mark(item);
		const place: Place = screen.kind === "day" ? "calendar" : PLACE_OF_LIST[screen.list];
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
		try {
			if ((await change()) === false) return;
		} catch (error) {
			if (!(error instanceof StaleTaskError)) throw error;
			new Notice(failureText(error));
		}
		await this.data.tasks();
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

	/** A column's title as a place to drop: what a drop there means is the screen's (`ScreenView.titleDrops`). */
	private columnTitle(column: ListColumn): ColumnTitle {
		return {
			el: () => (column === "backlog" ? this.backlogTitle : (this.headers?.titleOf(column) ?? null)),
			drop: () => this.data.titleDrop(column),
		};
	}

	/** The two columns the window shows, as places to drop. */
	private shownDrops(): (ListDrop | TimelineDrop | TreeDrop | ProjectsListDrop)[] {
		const shown: Record<RightMode, (ListDrop | TimelineDrop | TreeDrop | ProjectsListDrop | null)[]> = {
			calendar: [this.timelineDrop, this.leftDrop],
			soon: [this.soonDrop, this.leftDrop],
			inbox: [this.inboxDrop, this.backlogDrop, this.soonDrop],
			projects: [this.treeDrop, this.projectsListDrop],
		};
		return shown[this.mode()].filter((target) => target !== null);
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
			if (!this.fold(item, e.target)) this.showMenu(cardMenuTask(item, e.target), card, undefined, undefined, undefined, undefined, item);
		}, { signal });
	}

	/** What the core takes for the rows a drag carries on the Projects screen, as read at the lift. */
	private projectsDrops(drag: TaskDragPayload): readonly ProjectsDrop[] {
		return this.carry.dropsOf(drag);
	}

	/** Cards let go on a row of the tree: the project each was shown under gives way to the row's; its place in the funnel stays. */
	private async dropOnTree(drag: TaskDragPayload, node: string): Promise<null> {
		const cards = this.projectsDrops(drag);
		this.bulk.dropping(drag);
		await this.choices.settled();
		if (cards.length > 0) await this.act(() => this.deps.tasks.dropOnProject(cards, node));
		await this.projects?.refresh();
		return null;
	}

	/**
	 * Cards let go between the Projects screen's cards: written as the core says (`dropInProjects`), and the card the one
	 * under the finger lands on (`projectsDropPreview`) hidden until the float is down on it.
	 */
	private async dropInProjectsList(drag: TaskDragPayload, place: ListPlace): Promise<HTMLElement | null> {
		const projects = this.projects;
		const cards = this.projectsDrops(drag);
		this.bulk.dropping(drag);
		await this.choices.settled();
		if (!projects || cards.length === 0) return null;
		let landing: ProjectsDropLanding | null = null;
		await this.act(async () => {
			landing = (await this.deps.tasks.projectsDropPreview(cards, place)).landings[0] ?? null;
			await this.deps.tasks.dropInProjects(cards, place);
		});
		await projects.refresh();
		const card = landing ? projects.tasksList.cardOf(landing) : null;
		if (card) this.arriving.hold(card);
		return card;
	}

	/** The plus at the Projects screen: carried onto the tree or the tasks; tapped, a new task at the end of the chosen node's tasks. */
	private projectsPlus(): PlusAside | null {
		const projects = this.projects;
		if (!projects || this.mode() !== "projects") return null;
		return {
			targets: [this.treeDrop, this.tasksDrop],
			tap: () => {
				const end = projects.tasksShown;
				if (end.endTask) void this.newProjectsTask(end.endTask, end.parts[end.parts.length - 1]?.last ?? null);
			},
			dropped: (result) => {
				if (result.kind === "projectGap") void this.newProject(result.gap, result.landing);
				if (result.kind === "projectTasks") void this.newProjectsTask(result.newTask, result.after);
			},
		};
	}

	/** The plus let go at a gap of the tree: the name asked there, then the project made at that place and chosen. */
	private async newProject(gap: number, landing: ProjectsLanding): Promise<void> {
		const projects = this.projects;
		if (!projects || !this.arbiter.claim(NAMING)) return;
		const name = await projects.askProjectName(gap, landing.depth);
		this.arbiter.release(NAMING);
		if (name !== null) await this.act(async () => void (await this.deps.tasks.createProject(name, landing.place)));
		await projects.refresh();
	}

	/** The plus let go on the tasks: the text asked there, then the task written where the part says, with its project. */
	private async newProjectsTask(newTask: ProjectsNewTask, after: HTMLElement | null): Promise<void> {
		const projects = this.projects;
		if (!projects || !this.arbiter.claim(NAMING)) return;
		const text = await projects.askTaskText(after);
		this.arbiter.release(NAMING);
		if (text !== null) await this.act(async () => void (await this.deps.tasks.createInPlace(text, null, newTask.place, null, [], newTask.project)));
		await projects.refresh();
	}

	/** A drop: the service says what it means for the file (spec §5.1), for the card under the finger and those carried along. */
	/** The drop written and drawn: the card the dragged task stands on now, hidden until the float lands on it. */
	private async applyDrop(drag: TaskDragPayload, result: DropResult): Promise<HTMLElement | HeldOut | null> {
		if (isProjectsDrop(result)) {
			if (result.kind === "projectRow") return this.dropOnTree(drag, result.node);
			return result.kind === "projectsPlace" ? this.dropInProjectsList(drag, result.place) : null;
		}
		this.bulk.dropping(drag);
		this.arriving.dropping(drag.item);
		await this.act(async () => void (await this.deps.tasks.drop(droppedTasks(drag), result, this.selectedDate)));
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

	/** A tap on an empty section's No tasks plate: the field of a new task there. */
	private attachPlate(plate: HTMLElement, column: ListColumn, group: ListGroup, signal: AbortSignal): void {
		plate.addEventListener("click", () => this.quick?.openIn(column, group.name), { signal });
	}

	/** A tap on a card's folder mark opens the Projects screen on the task's project, in place of its menu; true when it did. */
	private openProjectOf(item: TaskItem, target: EventTarget | null): boolean {
		const project = item.project;
		if (!onProjectMark(target) || !project) return false;
		void this.showProjectNode(projectNodeOf(project.name));
		return true;
	}

	/** The chosen project's menu, its title tapped (spec decision 1): Rename in place, and its note attached, opened or detached. */
	private showProjectMenu(title: HTMLElement, view: ProjectsView): void {
		const menu = view.menu;
		const projects = this.projects;
		if (!menu || !projects || this.arbiter.busy) return;
		const name = menu.project.name;
		const tasks = this.deps.tasks;
		const changed = (write: () => Promise<unknown>) => void this.act(async () => void (await write())).then(() => projects.refresh());
		ProjectMenu.open(title, {
			title: view.title,
			renameLabel: menu.renameLabel,
			note: menu.note?.name ?? null,
			attachLabel: menu.attachLabel,
			detachLabel: menu.detachLabel,
			onRename: () => {
				if (!this.arbiter.claim(NAMING)) return;
				projects.editTitle((to) => {
					this.arbiter.release(NAMING);
					if (to === null) return void projects.refresh();
					changed(() => tasks.renameProject(name, to));
				});
			},
			onAttach: () => new NoteSearch(this.app, this.settings.tasksFile, (link) => changed(() => tasks.setProjectNote(name, link))).open(),
			onOpenNote: () => {
				if (menu.note) void this.app.workspace.openLinkText(menu.note.link, this.settings.tasksFile, "tab");
			},
			onDetach: () => changed(() => tasks.setProjectNote(name, null)),
			delete: menu.delete,
			onDelete: () => changed(() => tasks.deleteProject(name)),
		});
	}

	/** The Projects screen on `node`: chosen, its branches above unfolded, and the window turned there. */
	private async showProjectNode(node: string): Promise<void> {
		await this.act(() => this.deps.tasks.selectProjectNode(node));
		this.switcher?.show("projects");
		await this.projects?.refresh();
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
		const projectsFrom = source.closest(".tc-projects") ? source.dataset.menuFrom : undefined;
		if (projectsFrom) return projectsFrom as MenuFrom;
		if (full) return "full";
		if (source.classList.contains("tc-block")) return "timeline";
		return this.columnOf(source) ?? "done";
	}

	/** The screen a menu opens over (`TaskService.menu`). */
	private menuScreen(): MenuScreen {
		return { today: this.today(), day: this.selectedDate, offer: this.data.offer, projects: this.data.projectTree };
	}

	private listOf(column: ListColumn): TaskList | null {
		return { day: this.list, soon: this.soonList, inbox: this.inboxList, backlog: this.backlogList }[column];
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
	 * `drawn`: the task whose card `source` is, when the menu is its shown step's (a folded result, `TaskItem.card`).
	 */
	private showMenu(item: TaskItem, source: HTMLElement, lifted?: (copy: HTMLElement, close: () => void) => void, full?: FullScreen, held?: boolean, sheet?: Sheet, drawn?: TaskItem): TaskMenu {
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
			drawn,
			menu: (task) => tasks.menu(task, from, screen),
			onSubtask: (subtask, card, taken, drawnCard) => this.showMenu(subtask, card, undefined, undefined, undefined, taken, drawnCard),
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
		if (!this.headers || !this.switcher || !this.leftEl || !this.soonEl || !this.inboxEl || !this.doneEl || !this.doneList || !this.rightEl || !this.allDayEl || !this.timeline || !this.list || !this.soonList || !this.inboxList || !this.backlogList || !this.backlogTitle) return;
		if (parts.has("frame")) {
			this.fitListWidth();
			this.headers.render();
			this.showPlace(this.place());
		}
		this.switcher.render();
		if (parts.has("tasks")) {
			this.bulk.selection.forgetDrawn();
			const moving = this.drawnRead;
			this.drawnRead = this.data.read;
			this.list.render(moving);
			const missing = this.data.missing;
			root.classList.toggle("is-missing", missing);
			for (const part of [this.leftEl, this.soonEl, this.inboxEl, this.doneEl, this.rightEl]) part.classList.toggle("tc-hidden", missing);
			root.querySelector(".tc-missing")?.remove();
			if (missing) this.renderMissing(root);
			this.soonList.render(moving);
			this.inboxList.render(moving);
			this.backlogTitle.textContent = this.deps.tasks.listName("backlog");
			this.headers.render();
			this.backlogList.render(moving);
			this.doneList.render(moving);
			void this.projects?.refresh().catch((error: unknown) => this.reportFailure(error));
		}
		const hoursAt = this.landing?.peek.date === this.selectedDate ? { top: this.timeline.el.getBoundingClientRect().top, scroll: this.timeline.el.scrollTop } : null;
		if (parts.has("events")) renderAllDayRows(this.allDayEl, this.rightEl, this.data.allDay, this.theme(), (event) => this.deps.calendars.isPast(event));
		if (parts.has("tasks") || parts.has("events")) this.timeline.render(this.drawnRead);
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

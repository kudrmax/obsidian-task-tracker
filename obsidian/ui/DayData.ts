import type { CalendarEvent, CalendarService, DayEvents, DayView, GroupedList, ListGrouping, ListSection, ProjectRef, SectionOffer, SourceStatus, TaskItem, TaskService } from "../../core/application/contracts";
import { Reload } from "./Reload";
import type { LocalDate } from "./types";

export interface DayDataDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly date: () => LocalDate;
	/** The project whose view this is: the lists hold only its tasks. None for the main screen. */
	readonly project?: () => string | undefined;
	/** A part of the data changed: redraw what shows it. Data read the same as shown says nothing. */
	readonly onUpdate: (part: DayPart) => void;
}

export type DayPart = "tasks" | "events";

interface TasksState {
	/** The day the tasks were read for: a missing file read for another day is news too, the screen lands on that day. */
	readonly date: LocalDate | null;
	readonly day: DayView | null;
	readonly soon: readonly TaskItem[];
	readonly inbox: readonly TaskItem[];
	readonly backlog: readonly TaskItem[];
	readonly done: readonly TaskItem[];
	/** Each grouped list's groups in file order, its empty sections among them. */
	readonly sections: ListSections;
	/** The sections the menus offer, read with the lists. */
	readonly offer: SectionOffer;
	/** No tasks file: the screen offers to create it. */
	readonly missing: boolean;
	/** The day's events, their sources and the switch's dot show: the screen read says when not. */
	readonly calendars: boolean;
	/** Each list's grouping by project. */
	readonly projects: Readonly<Record<GroupedList, ListGrouping>>;
	/** The project whose view this is; null on the main screen. */
	readonly project: ProjectRef | null;
}

const NOT_GROUPED: ListGrouping = { canGroup: false, on: false, groups: [] };
const NO_GROUPING: Readonly<Record<GroupedList, ListGrouping>> = { inbox: NOT_GROUPED, backlog: NOT_GROUPED, soon: NOT_GROUPED, now: NOT_GROUPED };

type ListSections = Readonly<Record<GroupedList, readonly ListSection[]>>;

const NO_SECTIONS: ListSections = { inbox: [], backlog: [], soon: [], now: [] };

/** No sections to offer: nothing read yet. */
const NO_OFFER: SectionOffer = { lists: { now: [], soon: [], inbox: [], backlog: [] }, ungrouped: "" };

const NO_EVENTS: DayEvents = { events: [], allDay: [], timed: [], statuses: [], stale: false };

/**
 * What the screen shows for the selected day, in two parts that load on their own: the tasks, read from the file after
 * every change to it, and the events, fetched over the network only when the day opens or a refresh is asked for.
 * A change to a task never waits for the calendars.
 */
export class DayData {
	private state: TasksState = { date: null, day: null, soon: [], inbox: [], backlog: [], done: [], sections: NO_SECTIONS, offer: NO_OFFER, missing: false, calendars: true, projects: NO_GROUPING, project: null };
	private dayEvents: DayEvents = NO_EVENTS;
	/** What the screen was last told of each part, to tell only a change. */
	private readonly shown: Record<DayPart, string> = { tasks: this.drawnOf("tasks"), events: this.drawnOf("events") };
	private readonly taskReload: Reload<TasksState>;
	private readonly eventReload: Reload<DayEvents>;
	/** The next fetch is for a day that opens: it asks for the days next to it too. Taken when the fetch starts. */
	private around = false;

	constructor(private readonly deps: DayDataDeps) {
		this.taskReload = new Reload(() => this.readTasks(), (state, hooks) => this.show(() => (this.state = state), hooks));
		this.eventReload = new Reload(
			() => {
				const ask = deps.calendars.events(deps.date(), this.around ? "open" : "refresh");
				this.around = false;
				return ask.fresh?.() ?? Promise.resolve(ask.cached ?? NO_EVENTS);
			},
			(events, hooks) => this.show(() => (this.dayEvents = events), hooks),
		);
	}

	get day(): DayView | null {
		return this.state.day;
	}

	get soon(): readonly TaskItem[] {
		return this.state.soon;
	}

	get inbox(): readonly TaskItem[] {
		return this.state.inbox;
	}

	get backlog(): readonly TaskItem[] {
		return this.state.backlog;
	}

	get sections(): ListSections {
		return this.state.sections;
	}

	/** How `list` groups by project, as the screen last read it. */
	grouping(list: GroupedList): ListGrouping {
		return this.state.projects[list];
	}

	/** The project whose view the screen is; null on the main screen. */
	get project(): ProjectRef | null {
		return this.state.project;
	}

	/** The sections the menus offer. */
	get offer(): SectionOffer {
		return this.state.offer;
	}

	get done(): readonly TaskItem[] {
		return this.state.done;
	}

	get missing(): boolean {
		return this.state.missing;
	}

	get events(): readonly CalendarEvent[] {
		return this.state.calendars ? this.dayEvents.events : [];
	}

	/** The day's events of the whole day: the rows over the timeline. */
	get allDay(): readonly CalendarEvent[] {
		return this.state.calendars ? this.dayEvents.allDay : [];
	}

	/** The day's events on a time: the timeline. */
	get timed(): readonly CalendarEvent[] {
		return this.state.calendars ? this.dayEvents.timed : [];
	}

	get statuses(): readonly SourceStatus[] {
		return this.state.calendars ? this.dayEvents.statuses : [];
	}

	/** A calendar shown on the day comes from a file no longer fresh: the switch's dot. */
	get stale(): boolean {
		return this.state.calendars && this.dayEvents.stale;
	}

	/**
	 * The view opens: resolves once the tasks are read, with the events last fetched for the day. The fresh events are
	 * fetched in the background and redraw when they come: the phone keeps Obsidian's splash until the view has opened.
	 */
	load(): Promise<void> {
		this.showCached(this.dayEvents);
		void this.openDay();
		return this.tasks();
	}

	/**
	 * The tasks file read afresh: after a change to it. `beforeShow` runs once what was read is the data and before it
	 * is shown: what reads the data then reads what the screen is about to draw.
	 */
	tasks(beforeShow?: () => void): Promise<void> {
		return this.taskReload.request(beforeShow);
	}

	/** The events fetched afresh for the day alone: Refresh now in the sources popover, the polling, a source that changed. */
	calendars(): Promise<void> {
		this.around = false;
		return this.eventReload.request();
	}

	/** Another day is selected: its tasks, the events last fetched for it until the fresh ones come. */
	selectDay(): Promise<void> {
		this.showCached({ ...NO_EVENTS, statuses: this.dayEvents.statuses, stale: this.dayEvents.stale });
		return this.fetchBoth();
	}

	private showCached(otherwise: DayEvents): void {
		this.dayEvents = this.deps.calendars.events(this.deps.date(), "open").cached ?? otherwise;
	}

	private fetchBoth(): Promise<void> {
		return Promise.all([this.tasks(), this.openDay()]).then(() => undefined);
	}

	/** The day's events with the days next to it, so a swipe finds them ready. */
	private openDay(): Promise<void> {
		this.around = true;
		return this.eventReload.request();
	}

	private async readTasks(): Promise<TasksState> {
		const date = this.deps.date();
		const project = this.deps.project?.();
		const screen = await (project === undefined ? this.deps.tasks.screen(date) : this.deps.tasks.screen(date, project));
		return { date, ...screen, day: screen.missing ? null : screen.day };
	}

	/** The data changes, the hooks of the read run on it, and only then is the screen told. */
	private show(change: () => void, hooks: () => void): void {
		change();
		hooks();
		for (const part of ["tasks", "events"] as const) {
			const drawn = this.drawnOf(part);
			if (drawn === this.shown[part]) continue;
			this.shown[part] = drawn;
			this.deps.onUpdate(part);
		}
	}

	/** What the screen draws of a part: the events and the sources' dot, not when each source was last fetched; none while the calendars are not shown. */
	private drawnOf(part: DayPart): string {
		if (part === "tasks") return JSON.stringify(this.state);
		return JSON.stringify([this.state.calendars, this.dayEvents.events, this.dayEvents.statuses.map((status) => status.stale), this.dayEvents.stale]);
	}
}

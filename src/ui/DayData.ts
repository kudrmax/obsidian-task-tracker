import { type CalendarEvent, type CalendarService, type DayEvents, type DayView, type SectionOffer, type SourceStatus, type TaskItem, TasksFileMissingError, type TaskService } from "../application/contracts";
import { Reload } from "./Reload";
import type { LocalDate } from "./types";

export interface DayDataDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly date: () => LocalDate;
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
	/** The sections the menus offer, read with the lists. */
	readonly sections: SectionOffer;
	readonly missing: boolean;
}

/** No sections to offer: no file, or nothing read yet. */
const NO_SECTIONS: SectionOffer = { lists: { now: [], soon: [], inbox: [], backlog: [] }, ungrouped: "" };

const MISSING = { day: null, soon: [], inbox: [], backlog: [], sections: NO_SECTIONS, missing: true } as const;

/**
 * What the screen shows for the selected day, in two parts that load on their own: the tasks, read from the file after
 * every change to it, and the events, fetched over the network only when the day opens or a refresh is asked for.
 * A change to a task never waits for the calendars.
 */
export class DayData {
	private state: TasksState = { date: null, day: null, soon: [], inbox: [], backlog: [], sections: NO_SECTIONS, missing: false };
	private dayEvents: DayEvents = { events: [], statuses: [] };
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
				const date = deps.date();
				const around = this.around;
				this.around = false;
				return around ? deps.calendars.eventsAround(date) : deps.calendars.eventsOn(date);
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

	get sections(): SectionOffer {
		return this.state.sections;
	}

	get missing(): boolean {
		return this.state.missing;
	}

	get events(): readonly CalendarEvent[] {
		return this.missing ? [] : this.dayEvents.events;
	}

	get statuses(): readonly SourceStatus[] {
		return this.missing ? [] : this.dayEvents.statuses;
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
		this.showCached({ events: [], statuses: this.dayEvents.statuses });
		return this.fetchBoth();
	}

	private showCached(otherwise: DayEvents): void {
		this.dayEvents = this.deps.calendars.cached(this.deps.date()) ?? otherwise;
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
		const tasks = this.deps.tasks;
		const date = this.deps.date();
		try {
			await tasks.normalize();
			const [day, soon, inbox, backlog, sections] = await Promise.all([tasks.dayView(date), tasks.soonWithoutDateView(), tasks.inboxView(), tasks.backlogView(), tasks.sectionOffer(date)]);
			return { date, day, soon, inbox, backlog, sections, missing: false };
		} catch (error) {
			if (error instanceof TasksFileMissingError) return { date, ...MISSING };
			throw error;
		}
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

	/** What the screen draws of a part: the events and the sources' dot, not when each source was last fetched; a missing file shows none. */
	private drawnOf(part: DayPart): string {
		if (part === "tasks") return JSON.stringify(this.state);
		return JSON.stringify([this.missing, this.dayEvents.events, this.dayEvents.statuses.map((status) => status.stale)]);
	}
}

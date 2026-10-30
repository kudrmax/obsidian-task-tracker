import { type CalendarEvent, type CalendarService, type DayEvents, type DayView, type SourceStatus, type TaskItem, TasksFileMissingError, type TaskService } from "../application/contracts";
import { Reload } from "./Reload";
import type { LocalDate } from "./types";

export interface DayDataDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly date: () => LocalDate;
	/** The data changed: redraw. */
	readonly onUpdate: () => void;
}

interface TasksState {
	readonly day: DayView | null;
	readonly soon: readonly TaskItem[];
	readonly inbox: readonly TaskItem[];
	readonly missing: boolean;
}

const MISSING: TasksState = { day: null, soon: [], inbox: [], missing: true };

/**
 * What the screen shows for the selected day, in two parts that load on their own: the tasks, read from the file after
 * every change to it, and the events, fetched over the network only when the day opens or a refresh is asked for.
 * A change to a task never waits for the calendars.
 */
export class DayData {
	private state: TasksState = { day: null, soon: [], inbox: [], missing: false };
	private dayEvents: DayEvents = { events: [], statuses: [] };
	private readonly taskReload: Reload<TasksState>;
	private readonly eventReload: Reload<DayEvents>;

	constructor(private readonly deps: DayDataDeps) {
		this.taskReload = new Reload(() => this.readTasks(), (state) => this.show(() => (this.state = state)));
		this.eventReload = new Reload(() => deps.calendars.eventsOn(deps.date()), (events) => this.show(() => (this.dayEvents = events)));
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

	get missing(): boolean {
		return this.state.missing;
	}

	get events(): readonly CalendarEvent[] {
		return this.missing ? [] : this.dayEvents.events;
	}

	get statuses(): readonly SourceStatus[] {
		return this.missing ? [] : this.dayEvents.statuses;
	}

	/** The view opens: the events last fetched for the day at once, both parts afresh. */
	load(): Promise<void> {
		this.showCached(this.dayEvents);
		return this.fetchBoth();
	}

	/** The tasks file read afresh: after a change to it. */
	tasks(): Promise<void> {
		return this.taskReload.request();
	}

	/** The events fetched afresh: pull to refresh, the sources popover. */
	calendars(): Promise<void> {
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
		return Promise.all([this.tasks(), this.calendars()]).then(() => undefined);
	}

	private async readTasks(): Promise<TasksState> {
		const tasks = this.deps.tasks;
		try {
			await tasks.normalize();
			const [day, soon, inbox] = await Promise.all([tasks.dayView(this.deps.date()), tasks.soonWithoutDateView(), tasks.inboxView()]);
			return { day, soon, inbox, missing: false };
		} catch (error) {
			if (error instanceof TasksFileMissingError) return MISSING;
			throw error;
		}
	}

	private show(change: () => void): void {
		change();
		this.deps.onUpdate();
	}
}

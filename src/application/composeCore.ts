import { CalendarServiceImpl } from "./CalendarServiceImpl";
import { CALENDAR_SOURCES } from "./calendarFile";
import type { CalendarService, CalendarSource, DayService, TaskService, UndoService, WorkCalendarSetup } from "./contracts";
import { DayServiceImpl } from "./DayServiceImpl";
import type { EventFeed, EventFile } from "./EventSource";
import type { Clock, SettingsStore, TaskFileStore, Ticker, Timers } from "./ports";
import { TaskServiceImpl } from "./TaskServiceImpl";
import { UndoHistory } from "./UndoHistory";

/** What a host gives the core: its files, its settings, its time. */
export interface CorePorts {
	readonly tasksFile: TaskFileStore;
	readonly settings: SettingsStore;
	readonly clock: Clock;
	readonly ticker: Ticker;
	readonly timers: Timers;
	/** Each calendar's file, at the path `calendarPath` gives it. */
	readonly calendarFiles: Readonly<Record<CalendarSource, EventFile>>;
	/** What writes the files from elsewhere: Google's API. */
	readonly feeds: readonly EventFeed[];
	/** Asks the phone for fresh work events. */
	readonly work: Pick<WorkCalendarSetup, "export">;
	/** The host is the phone: only there do the phone's and Google's files meet, so only there the old choice of calendars is carried over. */
	readonly isPhone: () => boolean;
}

/** The services every frontend talks to. */
export interface Core {
	readonly tasks: TaskService;
	readonly days: DayService;
	readonly undo: UndoService;
	readonly calendars: CalendarService;
}

/** The services over a host's ports: the one place they are put together, the calendars in the order they are read. */
export function composeCore(ports: CorePorts): Core {
	const undo = new UndoHistory(ports.tasksFile);
	const tasks = new TaskServiceImpl(ports.tasksFile, ports.settings, ports.clock, undo);
	const files = CALENDAR_SOURCES.map((source) => ports.calendarFiles[source]);
	return {
		tasks,
		days: new DayServiceImpl(ports.clock, ports.settings, tasks, ports.ticker),
		undo,
		calendars: new CalendarServiceImpl(files, ports.feeds, ports.clock, ports.settings, ports.timers, ports.work, { canMigrate: ports.isPhone }),
	};
}

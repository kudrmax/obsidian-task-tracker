import { CalendarServiceImpl } from "./CalendarServiceImpl";
import { CALENDAR_SOURCES } from "./calendarFile";
import { AssistantServiceImpl } from "./assistant/AssistantServiceImpl";
import type { HostModels } from "./assistant/model";
import type { AssistantService, CalendarService, CalendarSource, DayService, TaskService, UndoService, WorkCalendarSetup } from "./contracts";
import { DayServiceImpl } from "./DayServiceImpl";
import { AgentReads } from "./agent/AgentReads";
import { ScreenSettingsImpl } from "./ScreenSettingsImpl";
import type { EventFeed, EventFile } from "./EventSource";
import type { Clock, Projects, ProjectsScreenStore, SettingsStore, TaskFileStore, Ticker, Timers } from "./ports";
import { TaskServiceImpl } from "./TaskServiceImpl";
import { UndoHistory } from "./UndoHistory";
import { TaskIdentity } from "./TaskIdentity";

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
	/** The notes that had the project tag, which the one move to projects attaches; none when left out. */
	readonly projects?: Projects;
	/** What this device keeps of the Projects screen; kept in memory when left out. */
	readonly projectsScreen?: ProjectsScreenStore;
	/** The tasks file as it stands, before the reads tidy it: what the agents' program edits by; left out, the file as read. */
	readonly storedTasks?: () => Promise<string | null>;
	/** The models this host serves and how it asks them; none when left out (the door, the phone plugin). */
	readonly models?: HostModels;
}

/** The services every frontend talks to. */
export interface Core {
	readonly tasks: TaskService;
	readonly days: DayService;
	readonly undo: UndoService;
	readonly calendars: CalendarService;
	readonly assistant: AssistantService;
	/** The agents' program's answers, over these very services. */
	readonly agent: AgentReads;
}

/** The services over a host's ports: the one place they are put together, the calendars in the order they are read. */
export function composeCore(ports: CorePorts): Core {
	const identity = new TaskIdentity();
	const undo = new UndoHistory(ports.tasksFile, identity);
	const tasks = new TaskServiceImpl(ports.tasksFile, ports.settings, ports.clock, undo, ports.projects, ports.projectsScreen, identity);
	const files = CALENDAR_SOURCES.map((source) => ports.calendarFiles[source]);
	const days = new DayServiceImpl(ports.clock, ports.settings, tasks, ports.ticker);
	const calendars = new CalendarServiceImpl(files, ports.feeds, ports.clock, ports.settings, ports.timers, ports.work, { canMigrate: ports.isPhone });
	const assistant = new AssistantServiceImpl({ tasks, steps: undo, settings: ports.settings, timers: ports.timers, models: ports.models });
	const agent = new AgentReads({ tasks, days, calendars, assistant, screenSettings: new ScreenSettingsImpl(ports.settings), clock: ports.clock, storedTasks: ports.storedTasks ?? (() => ports.tasksFile.read()) });
	return { tasks, days, undo, calendars, assistant, agent };
}

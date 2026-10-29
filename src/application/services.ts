import type { App } from "obsidian";
import { GoogleAuth } from "../infrastructure/GoogleAuth";
import { GoogleCalendarSource } from "../infrastructure/GoogleCalendarSource";
import { VaultTaskFileStore } from "../infrastructure/VaultTaskFileStore";
import { WorkCalendarFileSource } from "../infrastructure/WorkCalendarFileSource";
import { CalendarServiceImpl } from "./CalendarServiceImpl";
import type { CalendarService, TaskService } from "./contracts";
import { systemClock, type Clock, type SettingsStore } from "./ports";
import { TaskServiceImpl } from "./TaskServiceImpl";

export interface Services {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly google: GoogleAuth;
	readonly googleSource: GoogleCalendarSource;
}

export function createServices(app: App, settings: SettingsStore, clock: Clock = systemClock): Services {
	const store = new VaultTaskFileStore(app, () => settings.get().tasksFile);
	const google = new GoogleAuth(settings);
	const googleSource = new GoogleCalendarSource(google, settings);
	const workSource = new WorkCalendarFileSource(app.vault.adapter, settings);
	return {
		tasks: new TaskServiceImpl(store, settings, clock),
		calendars: new CalendarServiceImpl([googleSource, workSource], clock, settings),
		google,
		googleSource,
	};
}

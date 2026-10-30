import type { App } from "obsidian";
import { DeviceEventCache } from "../infrastructure/DeviceEventCache";
import { GoogleAuth } from "../infrastructure/GoogleAuth";
import { GoogleCalendarSource } from "../infrastructure/GoogleCalendarSource";
import { browserLoginDeps, GoogleRedirectLogin } from "../infrastructure/GoogleRedirectLogin";
import { requestToken } from "../infrastructure/GoogleToken";
import { VaultPathWatcher } from "../infrastructure/VaultPathWatcher";
import { VaultTaskFileStore } from "../infrastructure/VaultTaskFileStore";
import { WorkCalendarExportScript } from "../infrastructure/WorkCalendarExportScript";
import { WorkCalendarFileSource } from "../infrastructure/WorkCalendarFileSource";
import { WorkCalendarShortcut, type WorkCalendarShortcutHost } from "../infrastructure/WorkCalendarShortcut";
import { CalendarServiceImpl } from "./CalendarServiceImpl";
import type { CalendarService, TaskService } from "./contracts";
import { systemClock, type Clock, type SettingsStore } from "./ports";
import { TaskServiceImpl } from "./TaskServiceImpl";

export interface Services {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly google: GoogleAuth;
	readonly googleSource: GoogleCalendarSource;
	/** Receives Google's answer from the obsidian:// handler. */
	readonly login: GoogleRedirectLogin;
	readonly workExport: WorkCalendarExportScript;
	readonly workShortcut: WorkCalendarShortcut;
}

export interface ServicesHost {
	readonly pluginDir: string;
	readonly shortcuts: WorkCalendarShortcutHost;
}

export function createServices(app: App, host: ServicesHost, settings: SettingsStore, clock: Clock = systemClock): Services {
	const store = new VaultTaskFileStore(app, () => settings.get().tasksFile);
	const login = new GoogleRedirectLogin(browserLoginDeps((fields) => requestToken(settings.get().google.clientId, settings.get().google.clientSecret, fields)));
	const google = new GoogleAuth(settings, login);
	const googleSource = new GoogleCalendarSource(google, settings);
	const workSource = new WorkCalendarFileSource(app.vault.adapter, settings, new VaultPathWatcher(app.vault));
	return {
		tasks: new TaskServiceImpl(store, settings, clock),
		calendars: new CalendarServiceImpl([googleSource, workSource], clock, settings, new DeviceEventCache(app)),
		google,
		googleSource,
		login,
		workExport: new WorkCalendarExportScript(app.vault.adapter, host.pluginDir, settings),
		workShortcut: new WorkCalendarShortcut(host.shortcuts),
	};
}

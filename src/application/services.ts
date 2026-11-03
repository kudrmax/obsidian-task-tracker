import type { App } from "obsidian";
import { DeviceEventCache } from "../infrastructure/DeviceEventCache";
import { GoogleAuth } from "../infrastructure/GoogleAuth";
import { GoogleCalendarSource } from "../infrastructure/GoogleCalendarSource";
import { browserLoginDeps, GoogleRedirectLogin } from "../infrastructure/GoogleRedirectLogin";
import { requestToken } from "../infrastructure/GoogleToken";
import { obsidianHttp } from "../infrastructure/ObsidianHttp";
import { VaultPathWatcher } from "../infrastructure/VaultPathWatcher";
import { VaultTaskFileStore } from "../infrastructure/VaultTaskFileStore";
import { WorkCalendarExportScript } from "../infrastructure/WorkCalendarExportScript";
import { WorkCalendarFileSource } from "../infrastructure/WorkCalendarFileSource";
import { WorkCalendarShortcut, type WorkCalendarShortcutHost } from "../infrastructure/WorkCalendarShortcut";
import { CalendarServiceImpl } from "./CalendarServiceImpl";
import type { CalendarService, TaskService, UndoService } from "./contracts";
import { systemClock, type Clock, type SettingsStore } from "./ports";
import { TaskServiceImpl } from "./TaskServiceImpl";
import { UndoHistory } from "./UndoHistory";

export interface Services {
	readonly tasks: TaskService;
	readonly undo: UndoService;
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
	const history = new UndoHistory(store);
	const token = (fields: Record<string, string>) => requestToken(obsidianHttp, settings.get().google.clientId, settings.get().google.clientSecret, fields);
	const login = new GoogleRedirectLogin(browserLoginDeps(token));
	const google = new GoogleAuth(settings, login, token, clock);
	const googleSource = new GoogleCalendarSource(google, settings, clock, obsidianHttp);
	const workSource = new WorkCalendarFileSource(app.vault.adapter, settings, new VaultPathWatcher(app.vault));
	return {
		tasks: new TaskServiceImpl(store, settings, clock, history),
		undo: history,
		calendars: new CalendarServiceImpl([googleSource, workSource], clock, settings, new DeviceEventCache(app)),
		google,
		googleSource,
		login,
		workExport: new WorkCalendarExportScript(app.vault.adapter, host.pluginDir, settings),
		workShortcut: new WorkCalendarShortcut(host.shortcuts),
	};
}

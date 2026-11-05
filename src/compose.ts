import type { App } from "obsidian";
import { CalendarServiceImpl } from "./application/CalendarServiceImpl";
import type { CalendarService, GoogleAccount, TaskService, UndoService, WorkCalendarSetup } from "./application/contracts";
import { GoogleAccountService } from "./application/GoogleAccountService";
import { systemClock, type Clock, type SettingsStore } from "./application/ports";
import { TaskServiceImpl } from "./application/TaskServiceImpl";
import { UndoHistory } from "./application/UndoHistory";
import { DeviceEventCache } from "./infrastructure/DeviceEventCache";
import { GoogleAuth } from "./infrastructure/GoogleAuth";
import { GoogleCalendarSource } from "./infrastructure/GoogleCalendarSource";
import { browserLoginDeps, GoogleRedirectLogin } from "./infrastructure/GoogleRedirectLogin";
import { requestToken } from "./infrastructure/GoogleToken";
import { obsidianHttp } from "./infrastructure/ObsidianHttp";
import { VaultPathWatcher } from "./infrastructure/VaultPathWatcher";
import { VaultTaskFileStore } from "./infrastructure/VaultTaskFileStore";
import { WorkCalendarExportScript } from "./infrastructure/WorkCalendarExportScript";
import { WorkCalendarFileSource } from "./infrastructure/WorkCalendarFileSource";
import { WorkCalendarShortcut, type WorkCalendarShortcutHost } from "./infrastructure/WorkCalendarShortcut";

export interface Services {
	readonly tasks: TaskService;
	readonly undo: UndoService;
	readonly calendars: CalendarService;
	readonly google: GoogleAccount;
	readonly work: WorkCalendarSetup;
	/** Google's answer from the obsidian:// handler, turned into the refresh token. */
	receiveLogin(params: Record<string, string>): Promise<void>;
	/** Keeps the work calendar export in the plugin's folder for Scriptable. Returns the unsubscribe. */
	keepWorkExportInstalled(): () => void;
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
	const auth = new GoogleAuth(settings, login, token, clock);
	const googleSource = new GoogleCalendarSource(auth, settings, clock, obsidianHttp);
	const workSource = new WorkCalendarFileSource(app.vault.adapter, settings, new VaultPathWatcher(app.vault));
	const workExport = new WorkCalendarExportScript(app.vault.adapter, host.pluginDir, settings);
	const workShortcut = new WorkCalendarShortcut(host.shortcuts);
	return {
		tasks: new TaskServiceImpl(store, settings, clock, history),
		undo: history,
		calendars: new CalendarServiceImpl([googleSource, workSource], clock, settings, new DeviceEventCache(app)),
		google: new GoogleAccountService(auth, googleSource, settings),
		work: { scriptableLoader: () => workExport.loader, export: () => workShortcut.run() },
		receiveLogin: (params) => login.receive(params),
		keepWorkExportInstalled: () => workExport.keepInstalled(),
	};
}

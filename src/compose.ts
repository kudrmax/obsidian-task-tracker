import type { App, DataAdapter } from "obsidian";
import { CalendarServiceImpl } from "./application/CalendarServiceImpl";
import type { CalendarService, DayService, GoogleAccount, TaskService, UndoService, WorkCalendarSetup } from "./application/contracts";
import { DayServiceImpl } from "./application/DayServiceImpl";
import { GoogleAccountService } from "./application/GoogleAccountService";
import { systemClock, type Clock, type SettingsStore, type Ticker } from "./application/ports";
import { TaskServiceImpl } from "./application/TaskServiceImpl";
import { UndoHistory } from "./application/UndoHistory";
import { GOOGLE_CALENDAR_FILE } from "./application/calendarFile";
import { CalendarFileSource } from "./infrastructure/CalendarFileSource";
import { GoogleAuth } from "./infrastructure/GoogleAuth";
import { GoogleCalendarApi } from "./infrastructure/GoogleCalendarApi";
import { GoogleCalendarFeed } from "./infrastructure/GoogleCalendarFeed";
import { browserLoginDeps, GoogleRedirectLogin } from "./infrastructure/GoogleRedirectLogin";
import { requestToken } from "./infrastructure/GoogleToken";
import { obsidianHttp } from "./infrastructure/ObsidianHttp";
import { VaultPathWatcher } from "./infrastructure/VaultPathWatcher";
import { VaultTaskFileStore } from "./infrastructure/VaultTaskFileStore";
import { WorkCalendarExportScript } from "./infrastructure/WorkCalendarExportScript";
import { WorkCalendarShortcut, type WorkCalendarShortcutHost } from "./infrastructure/WorkCalendarShortcut";

export interface Services {
	readonly tasks: TaskService;
	readonly days: DayService;
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
	const googleApi = new GoogleCalendarApi(auth, settings, clock, obsidianHttp);
	const watcher = new VaultPathWatcher(app.vault);
	const googleFile = new CalendarFileSource("google", () => GOOGLE_CALENDAR_FILE, () => [], app.vault.adapter, watcher);
	const workFile = new CalendarFileSource("work", () => settings.get().workCalendarFile, () => settings.get().workCalendarTitles, app.vault.adapter, watcher);
	const googleFeed = new GoogleCalendarFeed(googleApi, auth, app.vault.adapter, settings, clock);
	const workExport = new WorkCalendarExportScript(app.vault.adapter, host.pluginDir, settings);
	const workShortcut = new WorkCalendarShortcut(host.shortcuts);
	const tasks = new TaskServiceImpl(store, settings, clock, history);
	return {
		tasks,
		days: new DayServiceImpl(clock, settings, tasks, windowTicker),
		undo: history,
		calendars: new CalendarServiceImpl([googleFile, workFile], [googleFeed], clock, settings),
		google: new GoogleAccountService(auth, googleApi, settings),
		work: { scriptableLoader: () => workExport.loader, export: () => workShortcut.run() },
		receiveLogin: (params) => login.receive(params),
		keepWorkExportInstalled: () => workExport.keepInstalled(),
	};
}

/** The window's interval timer. */
const windowTicker: Ticker = {
	every: (ms, tick) => {
		const id = window.setInterval(tick, ms);
		return () => window.clearInterval(id);
	},
};

/** Temporary: the quick entry trace's note in the vault, appended to; a failed write only goes to the console. */
export function vaultEntryLog(adapter: DataAdapter): { append(text: string): void } {
	const path = "Task Calendar entry log.md";
	return {
		append: (text) =>
			void adapter
				.exists(path)
				.then((exists) => (exists ? adapter.append(path, text) : adapter.write(path, text)))
				.catch((error) => console.error(error)),
	};
}

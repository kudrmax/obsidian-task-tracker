import type { App } from "obsidian";
import { calendarPath } from "./application/calendarFile";
import { composeCore, type Core } from "./application/composeCore";
import type { CalendarSource, GoogleAccount, WorkCalendarSetup } from "./application/contracts";
import { GoogleAccountService } from "./application/GoogleAccountService";
import { systemClock, type Clock, type SettingsStore, type Ticker, type Timers } from "./application/ports";
import { CalendarFileSource } from "./infrastructure/CalendarFileSource";
import { GoogleAuth } from "./infrastructure/GoogleAuth";
import { GoogleCalendarApi } from "./infrastructure/GoogleCalendarApi";
import { GoogleCalendarFeed } from "./infrastructure/GoogleCalendarFeed";
import { browserLoginDeps, GoogleRedirectLogin } from "./infrastructure/GoogleRedirectLogin";
import { requestToken } from "./infrastructure/GoogleToken";
import { obsidianHttp } from "./infrastructure/ObsidianHttp";
import { PhoneCalendarRefresh } from "./infrastructure/PhoneCalendarRefresh";
import { VaultPathWatcher } from "./infrastructure/VaultPathWatcher";
import { VaultTaskFileStore } from "./infrastructure/VaultTaskFileStore";
import { WorkCalendarExportScript } from "./infrastructure/WorkCalendarExportScript";
import { WorkCalendarShortcut, type WorkCalendarShortcutHost } from "./infrastructure/WorkCalendarShortcut";

export interface Services extends Core {
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
	const token = (fields: Record<string, string>) => requestToken(obsidianHttp, settings.get().google.clientId, settings.get().google.clientSecret, fields);
	const login = new GoogleRedirectLogin(browserLoginDeps(token));
	const auth = new GoogleAuth(settings, login, token, clock);
	const googleApi = new GoogleCalendarApi(auth, settings, clock, obsidianHttp);
	const watcher = new VaultPathWatcher(app.vault);
	const calendarFile = (source: CalendarSource) => new CalendarFileSource(source, () => calendarPath(source, settings.get()), app.vault.adapter, watcher);
	const calendarFiles = { google: calendarFile("google"), iphone: calendarFile("iphone"), work: calendarFile("work") };
	const googleFeed = new GoogleCalendarFeed(googleApi, auth, app.vault.adapter, settings, clock);
	const workExport = new WorkCalendarExportScript(app.vault.adapter, host.pluginDir, settings);
	const workShortcut = new WorkCalendarShortcut(host.shortcuts);
	const phoneRefresh = new PhoneCalendarRefresh({ host: host.shortcuts, readIphone: () => calendarFiles.iphone.read().catch(() => null), shortcut: workShortcut, clock, timers: windowTimers });
	const work: WorkCalendarSetup = { scriptableLoader: () => workExport.loader, export: () => phoneRefresh.export() };
	const core = composeCore({
		tasksFile: new VaultTaskFileStore(app, () => settings.get().tasksFile),
		settings,
		clock,
		ticker: windowTicker,
		timers: windowTimers,
		calendarFiles,
		feeds: [googleFeed],
		work,
		isPhone: () => host.shortcuts.isPhone,
	});
	return {
		...core,
		google: new GoogleAccountService(auth, googleApi, settings),
		work,
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

/** The window's one-shot timers. */
const windowTimers: Timers = { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) };

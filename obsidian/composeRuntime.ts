import { type App, Notice } from "obsidian";
import type { Clock, Timers } from "../core/application/ports";
import type { Services } from "./compose";
import type { PluginSettings } from "./infrastructure/PluginSettings";
import { VaultCalendarTexts } from "./runtime/network/VaultCalendarTexts";
import { ObsidianTasksVault } from "./runtime/persistence/TasksVault";
import { Runtime } from "./runtime/Runtime";
import type { StoredSettings } from "./settingsFile";
import { noticeText } from "./ui/failureText";

/** Which of the new screens this device runs (spec §Migration): kept on the device only, never synced, all off by default. */
export interface NewScreens {
	readonly newBlock: boolean;
}

/** Where the device keeps `NewScreens` (`app.loadLocalStorage`). */
export const NEW_SCREENS_KEY = "task-calendar:new-screens";

export function newScreensOf(app: App): NewScreens {
	const kept = app.loadLocalStorage(NEW_SCREENS_KEY) as Partial<NewScreens> | null;
	return { newBlock: kept?.newBlock === true };
}

const windowTimers: Timers = { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) };

/**
 * The runtime (P3) over Obsidian's vault and the plugin's settings, sharing the services' one Projects-screen store and
 * one reader of the project notes (decision 10). The note's block shows no calendar, so it is given no feed: the old
 * screen's polling stays the only fetcher until the leaf moves over (slice 4).
 */
export function composeRuntime(app: App, settings: PluginSettings<StoredSettings>, services: Services, clock: Clock, isIosApp: boolean): Runtime<StoredSettings> {
	return new Runtime<StoredSettings>({
		vault: new ObsidianTasksVault(app.vault),
		settings,
		projectsScreen: services.projectsScreenStore,
		projects: services.projects,
		isIosApp,
		feeds: [],
		calendarTexts: new VaultCalendarTexts(app.vault.adapter, app.vault),
		work: { export: () => services.work.export() },
		clock,
		timers: windowTimers,
		notices: { tell: (notice) => new Notice(noticeText(notice)) },
	});
}

import { Notice, Platform, Plugin, type EventRef, type Vault, type WorkspaceLeaf } from "obsidian";
import { AppleCalendar } from "./infrastructure/AppleCalendar";
import { PROTOCOL_ACTION } from "./infrastructure/GoogleRedirectLogin";

import { PluginSettings } from "./infrastructure/PluginSettings";
import { systemClock, type Clock, type SettingsStore } from "./application/ports";
import { createServices, type Services, type ServicesHost, vaultEntryLog } from "./compose";
import type { TaskCalendarSettings } from "./settings";
import { clearCardSize, showCardSize } from "./ui/cardSize";
import { clearPriorityColors, showPriorityColors } from "./ui/priorityColors";
import { TaskCalendarSettingsTab } from "./ui/SettingsTab";
import { TaskCalendarView, VIEW_TYPE, type ViewDeps } from "./ui/TaskCalendarView";

/** obsidian://task-calendar-open: a tap on a reminder on the phone opens the calendar. */
const OPEN_ACTION = "task-calendar-open";

/** The plugin is the settings store the view sees; PluginSettings keeps them. */
export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private pluginSettings!: PluginSettings;
	/** The real services, once built (the demo build has none): open for a look from the console. */
	services: Services | null = null;

	override async onload(): Promise<void> {
		this.pluginSettings = new PluginSettings(
			{
				loadData: () => this.loadData(),
				saveData: (data) => this.saveData(data),
				loadLocalStorage: (key) => this.app.loadLocalStorage(key),
				saveLocalStorage: (key, data) => this.app.saveLocalStorage(key, data),
			},
			`${this.pluginDir}/data.json`,
		);
		this.pluginSettings.onChange(() => {
			showCardSize({ height: this.get().cardHeight, gap: this.get().cardGap });
			showPriorityColors(this.get().priorities);
		});
		await this.pluginSettings.load();
		this.register(clearCardSize);
		this.register(clearPriorityColors);
		this.registerEvent(this.watchSettingsFile());
		this.registerDomEvent(document, "visibilitychange", () => {
			if (!document.hidden) void this.pluginSettings.reload();
		});
		const deps = this.createDeps();
		this.registerView(VIEW_TYPE, (leaf) => new TaskCalendarView(leaf, deps));
		this.addRibbonIcon("calendar-days", "Task Calendar", () => void this.openView());
		this.addCommand({ id: "open", name: "Open Task Calendar", callback: () => void this.openView() });
	}

	/** The real services over the vault and the network; the demo build replaces them with fakes. */
	protected createDeps(clock: Clock = systemClock): ViewDeps {
		const services = createServices(this.app, this.servicesHost(), this, clock);
		this.services = services;
		this.app.workspace.onLayoutReady(() => this.register(services.keepWorkExportInstalled()));
		this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (params) => {
			services.receiveLogin(params).then(
				() => new Notice("Google Calendar: logged in"),
				(e: unknown) => new Notice(`Google Calendar: ${e instanceof Error ? e.message : String(e)}`),
			);
		});
		this.registerObsidianProtocolHandler(OPEN_ACTION, () => void this.openView());
		this.addSettingTab(
			new TaskCalendarSettingsTab(this.app, this, { google: services.google, work: services.work }),
		);
		const calendarApp = new AppleCalendar({ isPhone: Platform.isIosApp, open: (url) => window.open(url), runScript: runAppleScript });
		return {
			tasks: services.tasks,
			days: services.days,
			undo: services.undo,
			calendars: services.calendars,
			settings: this,
			clock,
			openInCalendar: (event) => calendarApp.open(event),
			entryLog: vaultEntryLog(this.app.vault.adapter),
		};
	}

	private get pluginDir(): string {
		return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
	}

	private servicesHost(): ServicesHost {
		return {
			pluginDir: this.pluginDir,
			shortcuts: { isPhone: Platform.isIosApp, vaultName: this.app.vault.getName(), open: (url) => window.open(url) },
		};
	}

	/** Sync brings data.json from the other device (the Google token, logged in on the Mac): it counts here at once, with no reload. */
	private watchSettingsFile(): EventRef {
		const vault = this.app.vault as Vault & { on(name: "raw", callback: (path: string) => void): EventRef };
		return vault.on("raw", (path) => {
			if (this.pluginSettings.owns(path)) void this.pluginSettings.reload();
		});
	}

	get(): TaskCalendarSettings {
		return this.pluginSettings.get();
	}

	update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		return this.pluginSettings.update(patch);
	}

	onChange(listener: () => void): () => void {
		return this.pluginSettings.onChange(listener);
	}

	private async openView(): Promise<void> {
		const workspace = this.app.workspace;
		const leaf: WorkspaceLeaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}
}

/** The Mac runs it through osascript; Node's modules exist only in the desktop app, so they are reached for only here. */
function runAppleScript(script: string, args: readonly string[]): void {
	if (!Platform.isMacOS || !Platform.isDesktopApp) return;
	const { execFile } = (window as unknown as { require: (id: string) => typeof import("child_process") }).require("child_process");
	execFile("osascript", ["-e", script, ...args], () => undefined);
}

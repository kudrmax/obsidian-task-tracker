import { Notice, Platform, Plugin, type EventRef, type Vault, type WorkspaceLeaf } from "obsidian";
import { AppleCalendar } from "./infrastructure/AppleCalendar";
import { PROTOCOL_ACTION } from "./infrastructure/GoogleRedirectLogin";
import { openOutside } from "./infrastructure/OutsideLink";
import { SYNC_ACTION } from "./infrastructure/SyncRoundTrip";

import { PluginCodeWatcher } from "./infrastructure/PluginCodeWatcher";
import { PluginSettings } from "./infrastructure/PluginSettings";
import { systemClock, type Clock, type SettingsStore } from "../core/application/ports";
import { SettingsServiceImpl } from "../core/application/SettingsServiceImpl";
import { ScreenSettingsImpl } from "../core/application/ScreenSettingsImpl";
import { createServices, type Services, type ServicesHost } from "./compose";
import { SETTINGS_FILE, type StoredSettings } from "./settingsFile";
import { clearCardSize, showCardSize } from "./ui/cardSize";
import { clearPriorityColors, showLabelPaint, showPriorityColors } from "./ui/priorityColors";
import { addWindowDocument } from "./ui/windowDocuments";
import { TaskCalendarSettingsTab } from "./ui/SettingsTab";
import { TaskCalendarView, VIEW_TYPE, type ViewDeps } from "./ui/TaskCalendarView";
import { ProjectBlocks } from "./ui/ProjectBlocks";
import { ShownSettingsStore, ViewSettingsStore } from "./ui/viewSettings";

/** obsidian://task-calendar-open: a tap on a reminder on the phone opens the calendar. */
const OPEN_ACTION = "task-calendar-open";

/** The plugin is the settings store the services and the view see; PluginSettings keeps them. */
export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private pluginSettings!: PluginSettings<StoredSettings>;
	/** The view's own settings, kept in the same file. */
	protected readonly viewSettings = new ViewSettingsStore(this);
	/** The shared settings as a screen reads them: the levels and labels it paints. */
	private readonly screenSettings = new ScreenSettingsImpl(this);
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
			SETTINGS_FILE,
		);
		this.pluginSettings.onChange(() => {
			const screen = this.screenSettings.get();
			const view = this.viewSettings.get();
			showCardSize({ height: view.cardHeight, gap: view.cardGap });
			showPriorityColors(screen.priorities, screen.labels);
			showLabelPaint(view.labelPaint);
		});
		await this.pluginSettings.load();
		this.register(clearCardSize);
		this.register(clearPriorityColors);
		this.followPopoutWindows();
		const code = this.watchOwnCode();
		this.registerEvent(this.watchSettingsFile(code));
		this.registerDomEvent(document, "visibilitychange", () => {
			if (document.hidden) return;
			void this.pluginSettings.reload();
			void code.check();
		});
		const deps = this.createDeps();
		this.registerView(VIEW_TYPE, (leaf) => new TaskCalendarView(leaf, deps));
		this.addChild(new ProjectBlocks({ app: this.app, deps, settings: deps.settings }));
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
		this.registerObsidianProtocolHandler(SYNC_ACTION, () => services.syncForApp());
		this.register(() => services.stopSyncForApp());
		this.addSettingTab(
			new TaskCalendarSettingsTab(this.app, this, { settings: new SettingsServiceImpl(this), view: this.viewSettings, google: services.google, work: services.work, calendars: services.calendars, updatesLinks: () => (this.app.vault as unknown as { getConfig(key: string): unknown }).getConfig("alwaysUpdateLinks") !== false }),
		);
		const calendarApp = new AppleCalendar({ isPhone: Platform.isIosApp, open: (url) => openOutside(url, { isPhone: Platform.isIosApp, window }), runScript: runAppleScript });
		return {
			tasks: services.tasks,
			days: services.days,
			undo: services.undo,
			calendars: services.calendars,
			settings: this.shownSettings(),
			clock,
			openInCalendar: (event) => calendarApp.open(event),
		};
	}

	/** What the screen reads: the shared settings it draws and the view's own. */
	protected shownSettings(): ShownSettingsStore {
		return new ShownSettingsStore(this.screenSettings, this.viewSettings);
	}

	private get pluginDir(): string {
		return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
	}

	private servicesHost(): ServicesHost {
		return {
			pluginDir: this.pluginDir,
			shortcuts: { isPhone: Platform.isIosApp, vaultName: this.app.vault.getName(), open: (url) => openOutside(url, { isPhone: Platform.isIosApp, window }) },
		};
	}

	/**
	 * Sync brings data.json from the other device (the Google token, logged in on the Mac): it counts here at once, with no
	 * reload. A new release's files load the plugin again.
	 */
	private watchSettingsFile(code: PluginCodeWatcher): EventRef {
		const vault = this.app.vault as Vault & { on(name: "raw", callback: (path: string) => void): EventRef };
		return vault.on("raw", (path) => {
			if (this.pluginSettings.owns(path)) void this.pluginSettings.reload();
			code.changed(path);
		});
	}

	/** The plugin runs the code in its folder: a release Sync brought loads at once, not at Obsidian's next start. */
	/** A popout window gets the card size and the colours the main window has: a note's block or the screen moved there draws as here. */
	private followPopoutWindows(): void {
		const closings = new Map<Document, () => void>();
		const open = (doc: Document) => {
			if (doc !== document && !closings.has(doc)) closings.set(doc, addWindowDocument(doc));
		};
		this.app.workspace.iterateAllLeaves((leaf) => open(leaf.view.containerEl.ownerDocument));
		this.registerEvent(this.app.workspace.on("window-open", (win) => open(win.doc)));
		this.registerEvent(
			this.app.workspace.on("window-close", (win) => {
				closings.get(win.doc)?.();
				closings.delete(win.doc);
			}),
		);
		this.register(() => closings.forEach((close) => close()));
	}

	private watchOwnCode(): PluginCodeWatcher {
		const adapter = this.app.vault.adapter;
		const plugins = (this.app as unknown as { plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<boolean> } }).plugins;
		const id = this.manifest.id;
		const watcher = new PluginCodeWatcher(
			{
				stat: (path) => adapter.stat(path),
				reload: async () => {
					await plugins.disablePlugin(id);
					await plugins.enablePlugin(id);
				},
				setTimeout: (run, ms) => window.setTimeout(run, ms),
				clearTimeout: (timer) => window.clearTimeout(timer),
			},
			this.pluginDir,
		);
		void watcher.start();
		this.register(() => watcher.stop());
		return watcher;
	}

	get(): StoredSettings {
		return this.pluginSettings.get();
	}

	update(patch: Partial<StoredSettings>): Promise<void> {
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

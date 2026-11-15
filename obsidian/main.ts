import { MarkdownView, Notice, Platform, Plugin, type EventRef, type Vault, type WorkspaceLeaf } from "obsidian";
import { AppleCalendar } from "./infrastructure/AppleCalendar";
import { PROTOCOL_ACTION } from "./infrastructure/GoogleRedirectLogin";
import { openOutside } from "./infrastructure/OutsideLink";
import { SYNC_ACTION } from "./infrastructure/SyncRoundTrip";

import { PluginCodeWatcher } from "./infrastructure/PluginCodeWatcher";
import { DEVICE_STATE_KEY, PluginSettings } from "./infrastructure/PluginSettings";
import { systemClock, type Clock, type SettingsStore } from "../core/application/ports";
import { SettingsServiceImpl } from "../core/application/SettingsServiceImpl";
import { ScreenSettingsImpl } from "../core/application/ScreenSettingsImpl";
import { createServices, type Services, type ServicesHost } from "./compose";
import type { Http } from "./infrastructure/Http";
import { obsidianHttp } from "./infrastructure/ObsidianHttp";
import { SETTINGS_FILE, type StoredSettings } from "./settingsFile";
import { clearCardSize, showCardSize } from "./ui/cardSize";
import { clearPriorityColors, showLabelPaint, showPriorityColors } from "./ui/priorityColors";
import { addWindowDocument } from "./ui/windowDocuments";
import { ProjectBlocks } from "./ui/ProjectBlocks";
import { TaskCalendarSettingsTab } from "./ui/SettingsTab";
import { TaskCalendarView, VIEW_TYPE, type ViewDeps } from "./ui/TaskCalendarView";
import { ShownSettingsStore, ViewSettingsStore } from "./ui/viewSettings";
import { composeRuntime, newScreensOf } from "./composeRuntime";
import { failureText, NOTICE_WORDS } from "./ui/failureText";
import { StatusBarRoom } from "./ui/StatusBarRoom";
import { NoteBlocks, type NoteView, obsidianPlaces } from "./ui/next/host/block/NoteBlocks";
import { obsidianEditors, obsidianTitleField } from "./ui/next/drivers/islands";

/** The plugin's reach outside Obsidian (`TaskCalendarPlugin.outside`). */
export interface Outside {
	/** A link to another app (Shortcuts, the iPhone app, Calendar): on the phone the page goes there, on the Mac a window opens it. */
	open(url: string): void;
	/** An address in the browser. */
	browse(url: string): void;
	runScript(script: string, args: readonly string[]): void;
}

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
			showCardSize({ height: screen.cardHeight, gap: screen.cardGap });
			showPriorityColors(screen.priorities, screen.labels);
			showLabelPaint(screen.labelPaint);
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
		if (newScreensOf(this.app).newBlock) this.startNewBlocks(deps.clock);
		else this.addChild(new ProjectBlocks(this.app, deps));
		this.addRibbonIcon("calendar-days", "Task Calendar", () => void this.openView());
		this.addCommand({ id: "open", name: "Open Task Calendar", callback: () => void this.openView() });
	}

	/** The real services over the vault and the network; the demo build replaces them with fakes, the e2e build gives its clock and network. */
	protected createDeps(clock: Clock = systemClock, http: Http = obsidianHttp): ViewDeps {
		const services = createServices(this.app, this.servicesHost(), this, clock, http);
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
		this.handOverPlace(services);
		const settingsTab = new TaskCalendarSettingsTab(this.app, this, { settings: new SettingsServiceImpl(this), google: services.google, work: services.work, calendars: services.calendars });
		this.addSettingTab(settingsTab);
		this.register(() => settingsTab.closePage());
		const outside = this.outside();
		const calendarApp = new AppleCalendar({ isPhone: Platform.isIosApp, open: (url) => outside.open(url), runScript: (script, args) => outside.runScript(script, args) });
		return {
			tasks: services.tasks,
			days: services.days,
			undo: services.undo,
			calendars: services.calendars,
			settings: this.shownSettings(),
			clock,
			openInCalendar: (event) => calendarApp.open(event),
			browse: (url) => outside.browse(url),
		};
	}

	/**
	 * The new note blocks (spec §Migration, slice 3, behind `newBlock`): on the runtime, which is built once the layout is
	 * ready and the metadata cache resolved; on unload the blocks go first, then the runtime, whose queue writes on.
	 */
	private startNewBlocks(clock: Clock): void {
		const services = this.services;
		if (!services) return;
		const runtime = composeRuntime(this.app, this.pluginSettings, services, clock, Platform.isIosApp);
		const blocks = new NoteBlocks(obsidianPlaces(this.app, (view): view is NoteView => view instanceof MarkdownView), {
			openSession: () => runtime.openHost(),
			chromeRoom: (near) => StatusBarRoom.hold(near.ownerDocument ?? document),
			app: this.app,
			failure: (error) => (error.code === "undoConflict" ? (error.message === "redo" ? "Can’t redo: the tasks file changed" : "Can’t undo: the tasks file changed") : error.code === "staleTask" ? NOTICE_WORDS.stale : failureText(new Error(error.message))),
			notice: (text) => new Notice(text),
			titleField: (keys) => obsidianTitleField(this.app, () => this.pluginSettings.get().tasksFile, keys),
			editors: obsidianEditors(this.app, () => this.pluginSettings.get().tasksFile),
			openLink: (link) => {
				if (link.kind === "url") this.outside().open(link.target);
				else void this.app.workspace.openLinkText(link.target, this.pluginSettings.get().tasksFile, "tab");
			},
			openTasksFile: (line) => void this.openTasksFileAt(line),
		});
		this.app.workspace.onLayoutReady(() => runtime.hostReady("layout"));
		/** The notes' metadata read (`VaultProjects.ready`, which knows a plugin loaded into an indexed vault hears no `resolved`). */
		let told = false;
		const metadata = () => {
			if (told || !services.projects.ready()) return;
			told = true;
			runtime.hostReady("metadata");
		};
		this.app.workspace.onLayoutReady(metadata);
		this.registerEvent(this.app.metadataCache.on("resolved", metadata));
		this.register(services.projects.onChange(metadata));
		void runtime.ready().then(() => blocks.start(), () => undefined);
		this.blocksMade(blocks);
		this.register(() => {
			blocks.dispose();
			void runtime.unload();
		});
	}

	/** The tasks file opens in a new tab, as a link does, the cursor at the start of `line` and the line in the middle (a menu's Open in Obsidian). */
	private async openTasksFileAt(line: number): Promise<void> {
		const file = this.app.vault.getFileByPath(this.pluginSettings.get().tasksFile);
		if (!file) return;
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file, { active: true, state: { mode: "source" }, eState: { line } });
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const at = { line, ch: 0 };
		view.editor.setCursor(at);
		view.editor.scrollIntoView({ from: at, to: at }, true);
		view.editor.focus();
	}

	/** The notes' blocks were made: nothing here; the e2e build keeps them for the harness to reach. */
	protected blocksMade(_blocks: NoteBlocks): void {}

	/**
	 * The place the screen stood at was this view's own setting until 2026-11-12; the core keeps it now
	 * (`TaskService.setFunnelPlace`): one kept here is handed over once, and goes from the device's storage.
	 */
	private handOverPlace(services: Services): void {
		const device = this.app.loadLocalStorage(DEVICE_STATE_KEY) as Record<string, unknown> | null;
		if (!device || !("rightMode" in device)) return;
		const { rightMode, ...rest } = device;
		void services.tasks.setFunnelPlace(rightMode).then(() => this.app.saveLocalStorage(DEVICE_STATE_KEY, rest));
	}

	/** What the screen reads: the shared settings it draws and the view's own. */
	protected shownSettings(): ShownSettingsStore {
		return new ShownSettingsStore(this.screenSettings, this.viewSettings);
	}

	private get pluginDir(): string {
		return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
	}

	/**
	 * Where the plugin reaches outside Obsidian: links to other apps (Shortcuts, the iPhone app, a calendar), an address
	 * in the browser (a task's link, Google's login) and the Mac's scripts. The e2e build records them instead.
	 */
	protected outside(): Outside {
		return { open: (url) => openOutside(url, { isPhone: Platform.isIosApp, window }), browse: (url) => void window.open(url), runScript: runAppleScript };
	}

	private servicesHost(): ServicesHost {
		return {
			pluginDir: this.pluginDir,
			shortcuts: { isPhone: Platform.isIosApp, vaultName: this.app.vault.getName(), open: (url) => this.outside().open(url) },
			browse: (url) => this.outside().browse(url),
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

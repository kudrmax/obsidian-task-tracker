import { Notice, Platform, Plugin, type EventRef, type Vault } from "obsidian";
import { PROTOCOL_ACTION } from "./infrastructure/GoogleRedirectLogin";
import { openOutside } from "./infrastructure/OutsideLink";
import { SYNC_ACTION } from "./infrastructure/SyncRoundTrip";
import { PluginCodeWatcher } from "./infrastructure/PluginCodeWatcher";
import { DEVICE_STATE_KEY, PluginSettings } from "./infrastructure/PluginSettings";
import { systemClock, type SettingsStore } from "../core/application/ports";
import { SettingsServiceImpl } from "../core/application/SettingsServiceImpl";
import { ScreenSettingsImpl } from "../core/application/ScreenSettingsImpl";
import { CorePort } from "./adapters/CorePort";
import { DeviceSettings } from "./adapters/DeviceSettings";
import { createServices, type Services, type ServicesHost } from "./compose";
import { failureText } from "./host/failureText";
import { NoteBlocks } from "./host/NoteBlocks";
import { ScreenHost } from "./host/ScreenHost";
import { SETTINGS_FILE, type StoredSettings } from "./settingsFile";
import { TaskCalendarSettingsTab } from "./ui/settings/SettingsTab";

/** obsidian://task-calendar-open: a tap on a reminder on the phone opens the calendar. */
const OPEN_ACTION = "task-calendar-open";
/** The plugin's leaf: the view type it has always had, so a leaf Obsidian kept opens again. */
const VIEW_TYPE = "task-calendar";

/** The plugin is the settings store the services and the view see; PluginSettings keeps them. */
export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private pluginSettings!: PluginSettings<StoredSettings>;
	/** The real services, once built: open for a look from the console. */
	services: Services | null = null;
	/** The screen's port over the services, once the first screen opens. */
	private port: CorePort | null = null;

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
		await this.pluginSettings.load();
		const code = this.watchOwnCode();
		this.registerEvent(this.watchSettingsFile(code));
		this.registerDomEvent(document, "visibilitychange", () => {
			if (document.hidden) return;
			void this.pluginSettings.reload();
			void code.check();
		});
		const services = this.startServices();
		const host = new ScreenHost(this, {
			look: { type: VIEW_TYPE, title: "Task Calendar", icon: "calendar-days" },
			source: async () => {
				this.port = await CorePort.open({ ...services, clock: systemClock, onError: (error) => new Notice(failureText(error)) });
				return { port: this.port, device: new DeviceSettings({ get: () => this.get(), update: (patch) => this.update(patch) }, services.tasks, () => this.get().zoomLevels) };
			},
			paint: new ScreenSettingsImpl(this),
		});
		host.load();
		this.register(() => this.port?.dispose());
		this.addChild(new NoteBlocks(this.app, services.tasks, host));
		this.addRibbonIcon("calendar-days", "Task Calendar", () => void host.open());
		this.addCommand({ id: "open", name: "Open Task Calendar", callback: () => void host.open() });
		this.registerObsidianProtocolHandler(OPEN_ACTION, () => void host.open());
	}

	/** The services over the vault and the network, with what they hand to Obsidian: Google's login, the iPhone app's Sync, the settings tab. */
	private startServices(): Services {
		const services = createServices(this.app, this.servicesHost(), this);
		this.services = services;
		this.app.workspace.onLayoutReady(() => this.register(services.keepWorkExportInstalled()));
		this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (params) => {
			services.receiveLogin(params).then(
				() => new Notice("Google Calendar: logged in"),
				(e: unknown) => new Notice(`Google Calendar: ${e instanceof Error ? e.message : String(e)}`),
			);
		});
		this.registerObsidianProtocolHandler(SYNC_ACTION, () => services.syncForApp());
		this.register(() => services.stopSyncForApp());
		this.register(() => services.assistant.stopAll());
		this.handOverPlace(services);
		const settingsTab = new TaskCalendarSettingsTab(this.app, this, { settings: new SettingsServiceImpl(this), google: services.google, work: services.work, calendars: services.calendars, assistant: services.assistant });
		this.addSettingTab(settingsTab);
		this.register(() => settingsTab.closePage());
		return services;
	}

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
}

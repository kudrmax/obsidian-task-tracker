import { Notice, Platform, Plugin, type EventRef, type Vault, type WorkspaceLeaf } from "obsidian";
import { PROTOCOL_ACTION } from "./infrastructure/GoogleRedirectLogin";
import { systemClock, type Clock, type SettingsStore } from "./application/ports";
import { createServices, type ServicesHost } from "./application/services";
import { type DeviceState, partition, settingsFrom, sharedOf, type TaskCalendarSettings } from "./settings";
import { clearCardSize, showCardSize } from "./ui/cardSize";
import { TaskCalendarSettingsTab } from "./ui/SettingsTab";
import { TaskCalendarView, VIEW_TYPE, type ViewDeps } from "./ui/TaskCalendarView";

const DEVICE_STATE_KEY = "task-calendar:device";

/**
 * The settings: the synced file (data.json) for what is the vault's, and the device's own storage for the divider's
 * place and the column shown. The file is written over its freshest copy, so a token Sync just brought is never lost.
 */
export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private current: TaskCalendarSettings = settingsFrom(null);
	private readonly listeners = new Set<() => void>();

	override async onload(): Promise<void> {
		await this.reloadSettings();
		this.register(clearCardSize);
		this.registerEvent(this.watchSettingsFile());
		const deps = this.createDeps();
		this.registerView(VIEW_TYPE, (leaf) => new TaskCalendarView(leaf, deps));
		this.addRibbonIcon("calendar-days", "Task Calendar", () => void this.openView());
		this.addCommand({ id: "open", name: "Open Task Calendar", callback: () => void this.openView() });
	}

	/** The real services over the vault and the network; the demo build replaces them with fakes. */
	protected createDeps(clock: Clock = systemClock): ViewDeps {
		const services = createServices(this.app, this.servicesHost(), this, clock);
		this.register(services.workExport.keepInstalled());
		this.registerObsidianProtocolHandler(PROTOCOL_ACTION, (params) => {
			services.login.receive(params).then(
				() => new Notice("Google Calendar: logged in"),
				(e: unknown) => new Notice(`Google Calendar: ${e instanceof Error ? e.message : String(e)}`),
			);
		});
		this.addSettingTab(
			new TaskCalendarSettingsTab(this.app, this, {
				login: () => services.google.login(),
				logout: () => services.google.logout(),
				listCalendars: () => services.googleSource.listCalendars(),
				scriptableLoader: () => services.workExport.loader,
			}),
		);
		return { tasks: services.tasks, calendars: services.calendars, settings: this, clock, exportWorkCalendar: () => services.workShortcut.run() };
	}

	private servicesHost(): ServicesHost {
		return {
			pluginDir: this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`,
			shortcuts: { isPhone: Platform.isIosApp, vaultName: this.app.vault.getName(), open: (url) => window.open(url) },
		};
	}

	/** Sync brings data.json from the other device (the Google token, logged in on the Mac): it counts here at once, with no reload. */
	private watchSettingsFile(): EventRef {
		const file = `${this.manifest.dir}/data.json`;
		const vault = this.app.vault as Vault & { on(name: "raw", callback: (path: string) => void): EventRef };
		return vault.on("raw", (path) => {
			if (path === file) void this.reloadSettings();
		});
	}

	private deviceState(): Partial<DeviceState> {
		const saved = this.app.loadLocalStorage(DEVICE_STATE_KEY) as Partial<DeviceState> | null;
		return saved ?? {};
	}

	private async reloadSettings(): Promise<void> {
		this.current = { ...settingsFrom(await this.loadData()), ...this.deviceState() };
		this.emit();
	}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		const { device, shared } = partition(patch);
		const deviceState = { ...this.deviceState(), ...device };
		if (Object.keys(device).length) this.app.saveLocalStorage(DEVICE_STATE_KEY, deviceState);
		let fileSettings = settingsFrom(await this.loadData());
		if (Object.keys(shared).length) {
			fileSettings = settingsFrom({ ...fileSettings, ...shared });
			await this.saveData(sharedOf(fileSettings));
		}
		this.current = { ...fileSettings, ...deviceState };
		this.emit();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(): void {
		showCardSize({ height: this.current.cardHeight, gap: this.current.cardGap });
		for (const listener of this.listeners) listener();
	}

	private async openView(): Promise<void> {
		const workspace = this.app.workspace;
		const leaf: WorkspaceLeaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}
}

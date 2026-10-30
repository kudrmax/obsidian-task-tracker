import { Plugin, type EventRef, type Vault, type WorkspaceLeaf } from "obsidian";
import { systemClock, type Clock, type SettingsStore } from "./application/ports";
import { createServices } from "./application/services";
import { settingsFrom, type TaskCalendarSettings } from "./settings";
import { TaskCalendarSettingsTab } from "./ui/SettingsTab";
import { TaskCalendarView, VIEW_TYPE, type ViewDeps } from "./ui/TaskCalendarView";

export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private current: TaskCalendarSettings = settingsFrom(null);

	override async onload(): Promise<void> {
		this.current = settingsFrom(await this.loadData());
		this.registerEvent(this.watchSettingsFile());
		const deps = this.createDeps();
		this.registerView(VIEW_TYPE, (leaf) => new TaskCalendarView(leaf, deps));
		this.addRibbonIcon("calendar-days", "Task Calendar", () => void this.openView());
		this.addCommand({ id: "open", name: "Open Task Calendar", callback: () => void this.openView() });
	}

	/** The real services over the vault and the network; the demo build replaces them with fakes. */
	protected createDeps(clock: Clock = systemClock): ViewDeps {
		const services = createServices(this.app, this, clock);
		this.addSettingTab(
			new TaskCalendarSettingsTab(this.app, this, {
				login: () => services.google.login(),
				logout: () => services.google.logout(),
				listCalendars: () => services.googleSource.listCalendars(),
			}),
		);
		return { tasks: services.tasks, calendars: services.calendars, settings: this, clock };
	}

	/** Sync brings data.json from the other device (the Google token, logged in on the Mac): it counts here at once, with no reload. */
	private watchSettingsFile(): EventRef {
		const file = `${this.manifest.dir}/data.json`;
		const vault = this.app.vault as Vault & { on(name: "raw", callback: (path: string) => void): EventRef };
		return vault.on("raw", (path) => {
			if (path === file) void this.loadData().then((data) => (this.current = settingsFrom(data)));
		});
	}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		this.current = { ...this.current, ...patch };
		await this.saveData(this.current);
	}

	private async openView(): Promise<void> {
		const workspace = this.app.workspace;
		const leaf: WorkspaceLeaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}
}

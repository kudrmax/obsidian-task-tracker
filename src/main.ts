import { Plugin, type WorkspaceLeaf } from "obsidian";
import type { SettingsStore } from "./application/ports";
import { settingsFrom, type TaskCalendarSettings } from "./settings";
import { TaskCalendarView, VIEW_TYPE } from "./ui/TaskCalendarView";
// DEMO WIRING: replaced at integration
import { DemoCalendarService } from "../tests/fakes/DemoCalendarService";
import { DEMO_NOW, FixedClock } from "../tests/fakes/DemoClock";
import { DemoTaskService } from "../tests/fakes/DemoTaskService";

export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private current: TaskCalendarSettings = settingsFrom(null);

	override async onload(): Promise<void> {
		this.current = settingsFrom(await this.loadData());
		// DEMO WIRING: replaced at integration
		const clock = new FixedClock(DEMO_NOW);
		const deps = { tasks: new DemoTaskService(clock), calendars: new DemoCalendarService(), settings: this, clock };
		this.registerView(VIEW_TYPE, (leaf) => new TaskCalendarView(leaf, deps));
		this.addRibbonIcon("calendar-days", "Task Calendar", () => void this.openView());
		this.addCommand({ id: "open", name: "Open Task Calendar", callback: () => void this.openView() });
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

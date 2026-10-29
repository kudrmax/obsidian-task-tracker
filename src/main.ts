import { Plugin } from "obsidian";
import type { SettingsStore } from "./application/ports";
import { settingsFrom, type TaskCalendarSettings } from "./settings";

export default class TaskCalendarPlugin extends Plugin implements SettingsStore {
	private current: TaskCalendarSettings = settingsFrom(null);

	override async onload(): Promise<void> {
		this.current = settingsFrom(await this.loadData());
	}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		this.current = { ...this.current, ...patch };
		await this.saveData(this.current);
	}
}

import type { SettingsStore } from "../../src/application/ports";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../src/settings";

export class FakeSettingsStore implements SettingsStore {
	constructor(private current: TaskCalendarSettings = DEFAULT_SETTINGS) {}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		this.current = { ...this.current, ...patch };
	}
}

import type { SettingsStore } from "../../src/application/ports";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../src/settings";

export class FakeSettingsStore implements SettingsStore {
	private readonly listeners = new Set<() => void>();

	constructor(private current: TaskCalendarSettings = DEFAULT_SETTINGS) {}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		this.current = { ...this.current, ...patch };
		for (const listener of this.listeners) listener();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

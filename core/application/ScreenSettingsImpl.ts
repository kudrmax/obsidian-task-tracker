import type { TaskCalendarSettings } from "../settings";
import type { ScreenSettings, ScreenSettingsStore } from "./contracts";
import type { SettingsStore } from "./ports";

/** The part of the shared settings a screen reads. */
export function screenSettingsOf(settings: TaskCalendarSettings): ScreenSettings {
	return {
		longPressMs: settings.longPressMs,
		scrollToHour: settings.scrollToHour,
		tasksFile: settings.tasksFile,
		sections: settings.sections,
		ungrouped: settings.groups.ungrouped,
		priorities: settings.priorities,
		labels: settings.labels,
		labelPaint: settings.labelPaint,
	};
}

/** A screen's view of the settings store: read once per change of the settings. */
export class ScreenSettingsImpl implements ScreenSettingsStore {
	private source: TaskCalendarSettings | null = null;
	private shown: ScreenSettings | null = null;

	constructor(private readonly store: SettingsStore) {}

	get(): ScreenSettings {
		const settings = this.store.get();
		if (settings !== this.source || !this.shown) {
			this.source = settings;
			this.shown = screenSettingsOf(settings);
		}
		return this.shown;
	}

	onChange(listener: () => void): () => void {
		return this.store.onChange(listener);
	}
}

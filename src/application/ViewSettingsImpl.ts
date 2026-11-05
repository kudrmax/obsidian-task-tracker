import type { TaskCalendarSettings } from "../settings";
import type { ScreenSettings, ScreenState, ViewSettingsStore } from "./contracts";
import type { SettingsStore } from "./ports";

/** The part of the settings the screen reads. */
export function screenSettingsOf(settings: TaskCalendarSettings): ScreenSettings {
	return {
		listShare: settings.listShare,
		rightMode: settings.rightMode,
		zoom: settings.zoom,
		zoomLevels: settings.zoomLevels,
		cardHeight: settings.cardHeight,
		cardGap: settings.cardGap,
		longPressMs: settings.longPressMs,
		scrollToHour: settings.scrollToHour,
		tasksFile: settings.tasksFile,
		sections: settings.sections,
		ungrouped: settings.groups.ungrouped,
		priorities: settings.priorities,
	};
}

/** The screen's view of the settings store: read once per change of the settings, written only where the screen sets by hand. */
export class ViewSettingsImpl implements ViewSettingsStore {
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

	set(patch: Partial<ScreenState>): Promise<void> {
		return this.store.update(patch);
	}

	onChange(listener: () => void): () => void {
		return this.store.onChange(listener);
	}
}

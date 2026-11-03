import { sameLevels, type TaskCalendarSettings } from "../settings";

/** What a change of the settings asks of the screen. */
export interface SettingsEffect {
	/** The cards on the timeline stack anew: their height or the gap between them changed. */
	readonly restack: boolean;
	/** The tasks are read anew: the file, its names or its marks changed. */
	readonly reload: boolean;
	/** Today moved: the day starts at another hour. */
	readonly newDay: boolean;
	/** The columns shown or their width changed: another view of the calendar set them. */
	readonly frame: boolean;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function settingsEffect(before: TaskCalendarSettings, after: TaskCalendarSettings): SettingsEffect {
	return {
		restack: before.cardHeight !== after.cardHeight || before.cardGap !== after.cardGap,
		reload:
			before.tasksFile !== after.tasksFile ||
			!same(before.sections, after.sections) ||
			before.dueDateMarker !== after.dueDateMarker ||
			before.slotMarker !== after.slotMarker ||
			before.groups.ungrouped !== after.groups.ungrouped ||
			!same(before.groups.presets, after.groups.presets) ||
			!sameLevels(before.priorities, after.priorities),
		newDay: before.dayStartHour !== after.dayStartHour,
		frame: before.rightMode !== after.rightMode || before.listShare !== after.listShare,
	};
}

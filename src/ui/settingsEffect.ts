import { sameLevels, type TaskCalendarSettings } from "../settings";

/** What a change of the settings asks of the screen. */
export interface SettingsEffect {
	/** The cards on the timeline stack anew: their height or the gap between them changed. */
	readonly restack: boolean;
	/** The columns shown or their width changed: another view of the calendar set them. */
	readonly frame: boolean;
	/** What the screen draws straight from the settings changed: a list's name, No section's, the tasks file's path, the levels. */
	readonly drawn: boolean;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function settingsEffect(before: TaskCalendarSettings, after: TaskCalendarSettings): SettingsEffect {
	return {
		restack: before.cardHeight !== after.cardHeight || before.cardGap !== after.cardGap,
		frame: before.rightMode !== after.rightMode || before.listShare !== after.listShare,
		drawn:
			before.tasksFile !== after.tasksFile ||
			!same(before.sections, after.sections) ||
			before.groups.ungrouped !== after.groups.ungrouped ||
			!sameLevels(before.priorities, after.priorities),
	};
}

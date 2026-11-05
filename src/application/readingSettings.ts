import { sameLevels, type TaskCalendarSettings } from "../settings";

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The tasks are read anew: the file, its names or its marks changed. */
export function readsAnew(before: TaskCalendarSettings, after: TaskCalendarSettings): boolean {
	return (
		before.tasksFile !== after.tasksFile ||
		!same(before.sections, after.sections) ||
		before.dueDateMarker !== after.dueDateMarker ||
		before.slotMarker !== after.slotMarker ||
		before.alarmSlotMarker !== after.alarmSlotMarker ||
		before.silentSlotMarker !== after.silentSlotMarker ||
		before.repeatMarker !== after.repeatMarker ||
		before.groups.ungrouped !== after.groups.ungrouped ||
		!same(before.groups.presets, after.groups.presets) ||
		!sameLevels(before.priorities, after.priorities)
	);
}

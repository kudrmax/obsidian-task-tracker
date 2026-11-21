import { sameLabels, sameLevels, type TaskCalendarSettings } from "../settings";
import type { ShownChange } from "./contracts";
import { readingKey } from "./documentText";

/** The tasks are read anew: the file, its names or its marks changed, or the colours its levels and labels paint the cards with. */
export function readsAnew(before: TaskCalendarSettings, after: TaskCalendarSettings): boolean {
	return (
		before.tasksFile !== after.tasksFile ||
		readingKey(before) !== readingKey(after) ||
		!sameLevels(before.priorities, after.priorities) ||
		!sameLabels(before.labels, after.labels)
	);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What going from `before` to `after` changes on the screen; null when the screen shows none of it. */
export function shownChange(before: TaskCalendarSettings, after: TaskCalendarSettings): ShownChange | null {
	const change: ShownChange = {
		tasks: readsAnew(before, after),
		drawn:
			before.tasksFile !== after.tasksFile ||
			!same(before.sections, after.sections) ||
			before.groups.ungrouped !== after.groups.ungrouped ||
			!same(before.groups.presets, after.groups.presets) ||
			!sameLevels(before.priorities, after.priorities) ||
			!sameLabels(before.labels, after.labels) ||
			before.labelPaint !== after.labelPaint,
		cards: before.cardHeight !== after.cardHeight || before.cardGap !== after.cardGap,
		timeline: before.dayStartHour !== after.dayStartHour || before.scrollToHour !== after.scrollToHour || !same(before.zoomLevels, after.zoomLevels),
		gestures: before.longPressMs !== after.longPressMs,
		calendars: !same(before.hiddenCalendars, after.hiddenCalendars) || before.workCalendarFile !== after.workCalendarFile || before.staleAfterMinutes !== after.staleAfterMinutes,
	};
	return Object.values(change).some(Boolean) ? change : null;
}

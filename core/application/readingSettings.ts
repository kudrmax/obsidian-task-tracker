import { sameLabels, sameLevels, type TaskCalendarSettings } from "../settings";
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

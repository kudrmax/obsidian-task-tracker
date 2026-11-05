import type { TaskCalendarSettings } from "../settings";
import type { CalendarKey, KnownCalendar } from "./calendarChoice";

/**
 * The calendars hidden by the choice made before the calendars were shown per calendar: Google's calendars left
 * unchecked, and the calendars the work file's titles left out. Google's calendars never by the titles: they left the
 * work file only as doubles, and there are no doubles any more. `googleIds` maps Google's calendar ids to their titles.
 */
export function migratedHidden(settings: TaskCalendarSettings, known: readonly KnownCalendar[], googleIds: ReadonlyMap<string, string>): CalendarKey[] {
	const checked = new Set(settings.google.calendarIds.map((id) => googleIds.get(id)).filter((t): t is string => t !== undefined));
	const named = settings.workCalendarTitles.map((t) => t.trim().toLowerCase()).filter((t) => t !== "");
	return known
		.filter((c) => (c.google ? settings.google.calendarIds.length > 0 && !checked.has(c.key.title) : named.length > 0 && !named.includes(c.key.title.toLowerCase())))
		.map((c) => c.key);
}

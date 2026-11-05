import type { TaskCalendarSettings } from "../settings";
import type { CalendarKey, KnownCalendar } from "./calendarChoice";
import type { CalendarFile } from "./calendarFile";

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

/** The calendars hidden now: the list in the settings once the old choice was carried over, the old choice until then. */
export function hiddenNow(settings: TaskCalendarSettings, known: readonly KnownCalendar[], google: CalendarFile | undefined): CalendarKey[] {
	return settings.calendarsMigrated ? [...settings.hiddenCalendars] : migratedHidden(settings, known, googleIds(google));
}

/** Google's calendar ids and their titles, as `google.json` lists them. */
export function googleIds(google: CalendarFile | undefined): Map<string, string> {
	return new Map((google?.calendars ?? []).flatMap((c) => (c.calendarId === null ? [] : [[c.calendarId, c.title] as const])));
}

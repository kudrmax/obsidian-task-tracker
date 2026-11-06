import type { RightMode } from "./viewSettings";
import { addDays } from "./dates";
import type { LocalDate } from "./types";

/** The window's places left to right; a place's index is that of the first of the two columns it shows. */
export const PLACES: readonly RightMode[] = ["inbox", "soon", "calendar"];

/** Where the window stands: one of the places, or Done left of Inbox, which only the search opens. */
export type Place = RightMode | "done";

/** The place's index on the row: Done one before Inbox. */
export function placeIndex(place: Place): number {
	return place === "done" ? -1 : PLACES.indexOf(place);
}

/** A step back, to the left, or on, to the right. */
export type Shift = -1 | 1;

/** What the screen shows: the window's place and the day of its day column. */
export interface Screen {
	readonly mode: Place;
	readonly date: LocalDate;
}

/**
 * The screens stand in one row: Inbox and Soon, Soon and Now, Now and the calendar, then the calendar of each day after.
 * Today is where the calendar meets the lists; a past day the arrows reached walks on through the days, as a later one does.
 * From Done the row goes on to Inbox; nothing leads back to Done.
 */
export function stepScreen(from: Screen, shift: Shift, today: LocalDate): Screen | null {
	if (from.mode === "calendar" && (shift > 0 || from.date !== today)) return { mode: "calendar", date: addDays(from.date, shift) };
	const place = placeIndex(from.mode) + shift;
	return place >= 0 && place < PLACES.length ? { mode: PLACES[place], date: from.date } : null;
}

import { addDays } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { DropColumn } from "./contracts";

/** Where the screen stands: Inbox (Inbox over Backlog beside Soon), Soon (Soon beside the day's list), the calendar (the day's list beside the timeline). */
export type ScreenPlace = "inbox" | "soon" | "calendar";

/** The places left to right, as a swipe walks them. */
export const SCREEN_PLACES: readonly ScreenPlace[] = ["inbox", "soon", "calendar"];

/** The lists each place shows, in its order. */
export const SHOWN_LISTS: Readonly<Record<ScreenPlace, readonly DropColumn[]>> = { inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] };

/** The place that shows `column`: `place` itself when it does, else the nearest that does, the left one of two as near. */
export function placeShowing(column: DropColumn, place: ScreenPlace): ScreenPlace {
	if (SHOWN_LISTS[place].includes(column)) return place;
	const from = SCREEN_PLACES.indexOf(place);
	const showing = SCREEN_PLACES.filter((other) => SHOWN_LISTS[other].includes(column));
	return showing.reduce((best, other) => (Math.abs(SCREEN_PLACES.indexOf(other) - from) < Math.abs(SCREEN_PLACES.indexOf(best) - from) ? other : best));
}

/** Where a screen stands: one of the places, or Done left of Inbox, which only the search opens. */
export type ScreenSpot = ScreenPlace | "done";

/** What the screen shows: its place and the day of its day column. */
export interface ScreenAt {
	readonly mode: ScreenSpot;
	readonly date: LocalDate;
}

/** The place's index on the row: Done one before Inbox. */
function spotIndex(spot: ScreenSpot): number {
	return spot === "done" ? -1 : SCREEN_PLACES.indexOf(spot);
}

/**
 * Where a swipe or an arrow leads, a step back (-1) or on (1): the screens stand in one row, Inbox and Soon, Soon and Now,
 * Now and the calendar, then the calendar of each day after. Today is where the calendar meets the lists; a past day
 * walks on through the days, as a later one does. From Done the row goes on to Inbox; nothing leads back to Done, and
 * nothing before Inbox.
 */
export function stepScreen(from: ScreenAt, shift: -1 | 1, today: LocalDate): ScreenAt | null {
	if (from.mode === "calendar" && (shift > 0 || from.date !== today)) return { mode: "calendar", date: addDays(from.date, shift) };
	const place = spotIndex(from.mode) + shift;
	return place >= 0 && place < SCREEN_PLACES.length ? { mode: SCREEN_PLACES[place], date: from.date } : null;
}

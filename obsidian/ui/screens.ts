import { SCREEN_PLACES, type ScreenAt, type ScreenSpot } from "../../core/application/contracts";

/** Where the window stands: one of the places, or Done left of Inbox, which only the search opens. */
export type Place = ScreenSpot;

/** The place's index on the row: Done one before Inbox. */
export function placeIndex(place: Place): number {
	return place === "done" ? -1 : SCREEN_PLACES.indexOf(place);
}

/** A step back, to the left, or on, to the right. */
export type Shift = -1 | 1;

/** What the screen shows: the window's place and the day of its day column. */
export type Screen = ScreenAt;

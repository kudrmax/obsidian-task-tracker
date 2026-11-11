import { type ScreenAt, SCREEN_PLACES, type ScreenPlace, type ScreenSpot } from "../../core/application/contracts";

export { placeShowing, shownLists, SCREEN_PLACES, type ScreenPlace } from "../../core/application/contracts";

/** Where the window stands: one of the wheel's places, or Done left of Inbox, which only the search opens. */
export type Place = ScreenSpot;

/**
 * Where the wheel stands for a place, in icons' widths from the folder to the window's left edge: Projects alone in the
 * middle of the window, Inbox and Soon one place on, then a place per icon; Done, which has no icon, with Inbox alone in it.
 */
const WHEEL_AT: Readonly<Record<Place, number>> = { projects: -0.5, done: 0.5, inbox: 1, soon: 2, calendar: 3 };

export function placeIndex(place: Place): number {
	return WHEEL_AT[place];
}

/** The wheel's last place, the calendar's. */
export const WHEEL_END = WHEEL_AT[SCREEN_PLACES[SCREEN_PLACES.length - 1] as ScreenPlace];

/** A step back, to the left, or on, to the right. */
export type Shift = -1 | 1;

/** What the screen shows: the window's place and the day of its day column. */
export type Screen = ScreenAt;

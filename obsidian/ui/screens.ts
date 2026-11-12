import { type FunnelAt, FUNNEL_PLACES, type FunnelPlace, type FunnelSpot } from "../../core/application/contracts";

export { funnelPlaceShowing, FUNNEL_PLACES, type FunnelPlace } from "../../core/application/contracts";

/** Where the window stands: one of the wheel's places, or Done left of Inbox, which only the search opens. */
export type Place = FunnelSpot;

/** Where the wheel stands for a place, in icons' widths from Inbox: a place per icon; Done, which has no icon, with Inbox alone in the window. */
const WHEEL_AT: Readonly<Record<Place, number>> = { done: -0.5, inbox: 0, soon: 1, calendar: 2 };

export function placeIndex(place: Place): number {
	return WHEEL_AT[place];
}

/** The wheel's last place, the calendar's. */
export const WHEEL_END = WHEEL_AT[FUNNEL_PLACES[FUNNEL_PLACES.length - 1] as FunnelPlace];

/** A step back, to the left, or on, to the right. */
export type Shift = -1 | 1;

/** What the screen shows: the window's place and the day of its day column. */
export type Screen = FunnelAt;

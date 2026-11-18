import type { Place } from "../port";

/** The ribbon's places left to right, as a swipe and the wheel walk them. */
export const PLACES: readonly Place[] = ["inbox", "soon", "calendar"];

/** A finger let go this fast (px per ms) sends the ribbon the way it went, however little of the way it was drawn. */
export const FLICK_SPEED = 0.3;

/**
 * Where a ribbon let go after a swipe lands: a place on (1), back (-1) or none (0), never two. `moved` is how far the
 * finger took it from the place it stood at (positive: on), `distance` how far the next place stands, `speed` the finger's
 * speed as it let go, the same way round. A flick the way it was drawn goes on, one against it springs back; a slower
 * finger goes on once the ribbon came half the way.
 */
export function swipeStep(moved: number, distance: number, speed: number): -1 | 0 | 1 {
	if (moved === 0) return 0;
	const way = moved > 0 ? 1 : -1;
	if (Math.abs(speed) >= FLICK_SPEED) return Math.sign(speed) === way ? way : 0;
	return Math.abs(moved) * 2 >= distance ? way : 0;
}

/**
 * Where a step leads along the row of screens: Inbox–Soon, Soon–Now, Now–calendar of today, then the calendar of each day
 * after. At Now–calendar a step on turns the day; a step back on another day turns it back, and on today goes to Soon–Now.
 * Null past Inbox.
 */
export function stepFrom(place: Place, isToday: boolean, shift: -1 | 1): { readonly place: Place; readonly day: -1 | 0 | 1 } | null {
	if (place === "calendar" && (shift > 0 || !isToday)) return { place, day: shift };
	const at = PLACES.indexOf(place) + shift;
	return at >= 0 && at < PLACES.length ? { place: PLACES[at], day: 0 } : null;
}

/** The ribbon in a window `width` wide: a half column, the step between two places, each place's offset of the strip. */
export function ribbonMeasures(width: number, divider: number) {
	const half = (width - divider) / 2;
	const step = half + divider;
	return { half, step, offsetOf: (place: Place) => -PLACES.indexOf(place) * step };
}

/**
 * The two columns a place shows, left and right: at Inbox–Soon and at Soon–Now they split the window in half; at
 * Now–calendar the divider sets the day list (`list`) against the timeline, which takes the rest.
 */
export function placeColumns(place: Place, width: number, divider: number, list: number): readonly [number, number] {
	const { half } = ribbonMeasures(width, divider);
	return place === "calendar" ? [list, width - divider - list] : [half, half];
}

/** The day list's width as the ribbon moves from Soon–Now (`toCalendar` 0: half the window) to Now–calendar (1: the divider's). */
export function dayListWidth(half: number, list: number, toCalendar: number): number {
	return half + (list - half) * Math.max(0, Math.min(1, toCalendar));
}

/** A column the wheel names: Inbox, Soon, Now (the day's list), the calendar. */
export type WheelColumn = "inbox" | "soon" | "now" | "calendar";

/** The place nearest `at` that shows `column`: where a tap on the wheel's icon turns the ribbon. */
export function placeShowing(column: WheelColumn, at: Place): Place {
	if (column === "inbox") return "inbox";
	if (column === "calendar") return "calendar";
	if (column === "soon") return at === "calendar" ? "soon" : at;
	return at === "inbox" ? "soon" : at;
}

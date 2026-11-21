import type { ListId } from "../port";
import { type Screen, STOPS, type Stop } from "../store";

/** The strip of columns the ribbon slides, left to right. */
export type Column = ListId | "timeline";
export const STRIP: readonly Column[] = ["inbox", "soon", "day", "timeline"];

/** The ribbon's window shows two columns side by side. */
export const SHOWN = 2;

/** The strip's width, in percent of the ribbon's window, and each column's, in percent of the strip. */
export const STRIP_WIDTH = (STRIP.length / SHOWN) * 100;
export const COLUMN_SHARE = 100 / STRIP.length;

/** The two columns a stop shows, left and right. */
export function shownAt(stop: Stop): readonly [Column, Column] {
	const at = stop === "inbox" ? 0 : stop === "soon" ? 1 : 2;
	return [STRIP[at], STRIP[at + 1]];
}

/** How far the strip stands from its start at a stop, in columns: where the ribbon's gestures take it. */
export const offsetOf = (stop: Stop): number => STRIP.indexOf(shownAt(stop)[0]);

/** The ribbon's last stop, the day and its calendar, in places: past it the places are the days, one a day. */
export const CALENDAR = offsetOf("calendar");

/** Where the ribbon stands at a stop and day, in places: the stops' offsets, past the calendar one place a day. */
export const placeOf = (stop: Stop, dayOffset: number): number => offsetOf(stop) + (stop === "calendar" ? Math.max(0, dayOffset) : 0);

/** The ribbon stood at `place` (never before the first): the stop, and past the calendar the day, the screen shows from now on. */
export function standAt(screen: Pick<Screen, "setStop" | "showDay">, place: number): void {
	const at = Math.max(0, place);
	screen.setStop(STOPS.find((stop) => offsetOf(stop) === Math.min(at, CALENDAR)) ?? "calendar");
	screen.showDay(Math.max(0, at - CALENDAR));
}

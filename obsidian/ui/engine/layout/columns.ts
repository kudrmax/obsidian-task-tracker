import type { ListId } from "../port";
import type { Stop } from "../store";

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

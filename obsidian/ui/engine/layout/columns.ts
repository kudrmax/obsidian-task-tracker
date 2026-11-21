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

/**
 * The day list's column at `at` (places, the strip's stops): half the ribbon at Soon and before, as Inbox and Soon split it
 * (CLAUDE.md, «Behaviours Max had to ask for twice»); at the calendar the list's width the divider set and its half of the
 * divider; between Soon and the calendar each width mixed by the way gone (the design's «Переход»). The calendar keeps the
 * width it has at the calendar all the way (the stylesheet's `.is-timeline`).
 */
const towardCalendar = (at: number): number => Math.min(1, Math.max(0, at - offsetOf("soon")));

export function dayColumnWidth(at: number): string {
	const toward = towardCalendar(at);
	return `calc(${COLUMN_SHARE}% + ${toward} * (var(--tc-list-width) + var(--tc-divider) / 2 - ${COLUMN_SHARE}%))`;
}

/**
 * Where the divider between two columns stands off their meeting point, at the ribbon's place `at`: in the middle of the
 * window at the stop that shows both (`stop`), whole past the window's edge where only one of them shows, and between the
 * two with the strip (the design's «Переход»: at Soon the divider beside the calendar waits past the right edge and comes
 * in to the list's width).
 */
export const ruleShift =
	(stop: Stop) =>
	(at: number): string =>
		`calc(${Math.min(1, Math.max(-1, offsetOf(stop) - at))} * var(--tc-divider) / 2)`;

/** How wide a place is drawn, px: a stop's step is half the ribbon; past the calendar a day is the day list's column. */
export interface PlaceWidths {
	readonly stop: number;
	readonly day: number;
}

const pxOf = (place: number, w: PlaceWidths): number => (place <= CALENDAR ? place * w.stop : CALENDAR * w.stop + (place - CALENDAR) * w.day);
const placeOfPx = (px: number, w: PlaceWidths): number => (px <= CALENDAR * w.stop ? px / w.stop : CALENDAR + (px - CALENDAR * w.stop) / w.day);

/**
 * The px a place counts for a stroke `moved` px on from `base` (places): each place as wide as it is drawn, so the columns
 * and the day's pages stay under the fingers on either side of the calendar, whatever width the divider gave the list.
 */
export function strokeWidth(base: number, moved: number, w: PlaceWidths): number {
	const edge = CALENDAR * w.stop;
	const from = pxOf(base, w);
	const to = from + moved;
	if (from <= edge && to <= edge) return w.stop;
	if (from >= edge && to >= edge) return w.day;
	return moved / (placeOfPx(to, w) - base);
}

/** The px a place counts for a landing from `from` to `to`: a day's past the calendar, else a stop's. */
export const landingWidth = (from: number, to: number, w: PlaceWidths): number => (Math.max(from, to) > CALENDAR ? w.day : w.stop);

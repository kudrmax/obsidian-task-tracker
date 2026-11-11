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

/**
 * A place the wheel turns to: Projects, left of Inbox, a place of its own (the tree and the chosen node's tasks; the
 * wheel's window holds its folder alone), then the funnel's places (`SCREEN_PLACES`).
 */
export type WheelPlace = "projects" | ScreenPlace;

/** The wheel's places left to right, as a swipe walks them. */
export const WHEEL_PLACES: readonly WheelPlace[] = ["projects", ...SCREEN_PLACES];

/** The funnel's lists a wheel's place shows, in its order: Projects none. */
export function shownLists(place: WheelPlace): readonly DropColumn[] {
	return place === "projects" ? [] : SHOWN_LISTS[place];
}

/** The funnel's place that shows `column` from a wheel's place: from Projects as from Inbox, its neighbour. */
export function placeOfList(column: DropColumn, place: WheelPlace): ScreenPlace {
	return placeShowing(column, place === "projects" ? "inbox" : place);
}

/** Where the wheel stands: one of its places, or Done between Projects and Inbox, which only the search opens. */
export type WheelSpot = WheelPlace | "done";

/** What the screen shows on the wheel: its place and the day of its day column. */
export interface WheelAt {
	readonly mode: WheelSpot;
	readonly date: LocalDate;
}

/**
 * `stepScreen` on the wheel, Projects first: a step back from Inbox and Soon, or from Done, reaches Projects; a step on
 * from Projects, or from Done, goes to Inbox; nothing stands before Projects. The rest as `stepScreen`.
 */
export function stepWheel(from: WheelAt, shift: -1 | 1, today: LocalDate): WheelAt | null {
	if (from.mode === "projects") return shift > 0 ? { mode: "inbox", date: from.date } : null;
	if (shift < 0 && (from.mode === "inbox" || from.mode === "done")) return { mode: "projects", date: from.date };
	return stepScreen({ mode: from.mode, date: from.date }, shift, today);
}

/** A finger let go this fast, px per ms, sends the screen the way it went, however little of the way it was drawn. */
export const SWIPE_FLICK_SPEED = 0.3;

/**
 * Where a screen let go after a swipe lands: a step on (1), back (-1) or none (0), never further than the next screen.
 * `moved` is how far the finger drew it towards the next screen on (negative: back), `distance` how far that screen
 * stands, `speed` the finger's speed as it let go, px per ms, the same way round. A flick the way it was drawn arrives and
 * one against it springs back; a slower finger arrives once the screen has come half the way.
 */
export function swipeLanding(moved: number, distance: number, speed: number): -1 | 0 | 1 {
	if (moved === 0) return 0;
	const shift = moved > 0 ? 1 : -1;
	if (Math.abs(speed) >= SWIPE_FLICK_SPEED) return Math.sign(speed) === shift ? shift : 0;
	return Math.abs(moved) * 2 >= distance ? shift : 0;
}

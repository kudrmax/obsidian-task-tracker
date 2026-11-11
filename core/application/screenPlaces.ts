import { addDays } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { DropColumn } from "./contracts";

/**
 * Where the screen stands: Projects (the tree and the chosen node's tasks, a place of its own: the wheel's window holds
 * its folder alone), Inbox (Inbox over Backlog beside Soon), Soon (Soon beside the day's list), the calendar (the day's
 * list beside the timeline).
 */
export type ScreenPlace = "projects" | "inbox" | "soon" | "calendar";

/** The places left to right, as a swipe and the wheel walk them: Projects first, left of Inbox. */
export const SCREEN_PLACES: readonly ScreenPlace[] = ["projects", "inbox", "soon", "calendar"];

/** The funnel's lists each place shows, in its order: Projects none. */
export const SHOWN_LISTS: Readonly<Record<ScreenPlace, readonly DropColumn[]>> = { projects: [], inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] };

/** The funnel's lists `place` shows (`SHOWN_LISTS`), for a host that asks a rule rather than reading the constant. */
export function shownLists(place: ScreenPlace): readonly DropColumn[] {
	return SHOWN_LISTS[place];
}

/**
 * The place that shows `column`: `place` itself when it does, else the nearest that does, the left one of two as near;
 * from Projects as from Inbox, its neighbour.
 */
export function placeShowing(column: DropColumn, place: ScreenPlace): ScreenPlace {
	const at: ScreenPlace = place === "projects" ? "inbox" : place;
	if (SHOWN_LISTS[at].includes(column)) return at;
	const from = SCREEN_PLACES.indexOf(at);
	const showing = SCREEN_PLACES.filter((other) => SHOWN_LISTS[other].includes(column));
	return showing.reduce((best, other) => (Math.abs(SCREEN_PLACES.indexOf(other) - from) < Math.abs(SCREEN_PLACES.indexOf(best) - from) ? other : best));
}

/** Where a screen stands: one of the places, or Done between Projects and Inbox, which only the search opens. */
export type ScreenSpot = ScreenPlace | "done";

/** What the screen shows: its place and the day of its day column. */
export interface ScreenAt {
	readonly mode: ScreenSpot;
	readonly date: LocalDate;
}

/**
 * Where a swipe or an arrow leads, a step back (-1) or on (1): the screens stand in one row, Projects, Inbox and Soon,
 * Soon and Now, Now and the calendar, then the calendar of each day after. Today is where the calendar meets the lists;
 * a past day walks on through the days, as a later one does. From Done the row goes on to Inbox and back to Projects;
 * nothing leads back to Done, and nothing stands before Projects.
 */
export function stepScreen(from: ScreenAt, shift: -1 | 1, today: LocalDate): ScreenAt | null {
	if (from.mode === "calendar" && (shift > 0 || from.date !== today)) return { mode: "calendar", date: addDays(from.date, shift) };
	const at = from.mode === "done" ? SCREEN_PLACES.indexOf("inbox") + (shift > 0 ? 0 : -1) : SCREEN_PLACES.indexOf(from.mode) + shift;
	return at >= 0 && at < SCREEN_PLACES.length ? { mode: SCREEN_PLACES[at], date: from.date } : null;
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

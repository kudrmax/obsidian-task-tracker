import { type DropColumn, placeShowing, SCREEN_PLACES, SHOWN_LISTS, type ScreenAt, type ScreenPlace, type ScreenSpot } from "../../core/application/contracts";

/**
 * The places the wheel turns to, left to right: Projects, then the core's. Projects stands here until the core's
 * `SCREEN_PLACES` and `stepScreen` have it (asked of the backend): then this list is the core's.
 */
export type WheelPlace = ScreenPlace | "projects";
export const WHEEL_PLACES: readonly WheelPlace[] = ["projects", ...SCREEN_PLACES];

/** Where the window stands: one of the places, or Done left of Inbox, which only the search opens. */
export type Place = ScreenSpot | "projects";

/**
 * Where the wheel stands for a place, in icons' widths from the folder to the window's left edge: Projects alone in the
 * middle of the window, Inbox and Soon one place on, then a place per icon; Done, which has no icon, with Inbox alone in it.
 */
const WHEEL_AT: Readonly<Record<Place, number>> = { projects: -0.5, done: 0.5, inbox: 1, soon: 2, calendar: 3 };

export function placeIndex(place: Place): number {
	return WHEEL_AT[place];
}

/** The wheel's last place, the calendar's. */
export const WHEEL_END = WHEEL_AT.calendar;

/** A step back, to the left, or on, to the right. */
export type Shift = -1 | 1;

/** What the screen shows: the window's place and the day of its day column. */
export type Screen = ScreenAt;

/**
 * Where a swipe or an arrow leads: the core's row of screens, with Projects before Inbox, which a step back from Inbox
 * (or from Done) reaches and a step on from leaves for Inbox. Until the core's `stepScreen` has it (asked of the backend).
 */
export function stepWithProjects(from: { readonly mode: Place; readonly date: ScreenAt["date"] }, shift: Shift, step: (from: ScreenAt, shift: Shift) => ScreenAt | null): { readonly mode: Place; readonly date: ScreenAt["date"] } | null {
	if (from.mode === "projects") return shift > 0 ? { mode: "inbox", date: from.date } : null;
	if (shift < 0 && (from.mode === "inbox" || from.mode === "done")) return { mode: "projects", date: from.date };
	return step({ mode: from.mode, date: from.date }, shift);
}

/** The lists a place shows: the Projects screen shows none of the funnel's. */
export function shownLists(place: WheelPlace): readonly DropColumn[] {
	return place === "projects" ? [] : SHOWN_LISTS[place];
}

/** The place that shows `column`, from `place`: from Projects, as from Inbox, its neighbour. */
export function placeOfList(column: DropColumn, place: WheelPlace): ScreenPlace {
	return placeShowing(column, place === "projects" ? "inbox" : place);
}

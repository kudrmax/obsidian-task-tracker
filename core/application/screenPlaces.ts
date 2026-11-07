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

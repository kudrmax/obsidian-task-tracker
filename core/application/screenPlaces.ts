import { addDays } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { DropColumn } from "./contracts";

/**
 * A list a task's field can stand in: a funnel's column, or the Projects list, the chosen node's tasks by project. Every
 * rule of the entry that walks the lists walks `ENTRY_LISTS`, so a list added here is one it knows everywhere.
 */
export type EntryList = DropColumn | "projects";

const LIST_SET: Readonly<Record<EntryList, true>> = { day: true, soon: true, inbox: true, backlog: true, projects: true };

/** Every list a field can stand in, the funnel's first. */
export const ENTRY_LISTS: readonly EntryList[] = Object.keys(LIST_SET) as EntryList[];

/**
 * Where the funnel's screen stands, as a swipe and the wheel walk it: Inbox (Inbox over Backlog beside Soon), Soon (Soon
 * beside the day's list), the calendar (the day's list beside the timeline). Projects are no place: the tree is a panel
 * and its chosen node filters every place (`TaskService.funnelView`).
 */
export type FunnelPlace = "inbox" | "soon" | "calendar";

/** The funnel's places left to right, as a swipe and the wheel walk them. */
export const FUNNEL_PLACES: readonly FunnelPlace[] = ["inbox", "soon", "calendar"];

/** Where the funnel's screen stands: one of its places, or Done left of Inbox, which only the search opens. */
export type FunnelSpot = FunnelPlace | "done";

/** What the funnel's screen shows: its spot and the day of its day column. */
export interface FunnelAt {
	readonly mode: FunnelSpot;
	readonly date: LocalDate;
}

/**
 * Where a swipe or an arrow leads on the funnel, a step back (-1) or on (1): Inbox and Soon, Soon and Now, Now and the
 * calendar, then the calendar of each day after; a past day walks on through the days, as a later one does. From Done
 * the row goes on to Inbox; nothing leads back to Done, and nothing stands before Inbox.
 */
export function stepFunnel(from: FunnelAt, shift: -1 | 1, today: LocalDate): FunnelAt | null {
	if (from.mode === "calendar" && (shift > 0 || from.date !== today)) return { mode: "calendar", date: addDays(from.date, shift) };
	if (from.mode === "done") return shift > 0 ? { mode: "inbox", date: from.date } : null;
	const at = FUNNEL_PLACES.indexOf(from.mode) + shift;
	return at >= 0 && at < FUNNEL_PLACES.length ? { mode: FUNNEL_PLACES[at], date: from.date } : null;
}

/** The funnel's place that shows `column`: `spot` itself when it does (Done as Inbox), else the nearest that does, the left one of two as near. */
export function funnelPlaceShowing(column: DropColumn, spot: FunnelSpot): FunnelPlace {
	const at: FunnelPlace = spot === "done" ? "inbox" : spot;
	if (SHOWN_LISTS[at].includes(column)) return at;
	const from = FUNNEL_PLACES.indexOf(at);
	const showing = FUNNEL_PLACES.filter((other) => SHOWN_LISTS[other].includes(column));
	return showing.reduce((best, other) => (Math.abs(FUNNEL_PLACES.indexOf(other) - from) < Math.abs(FUNNEL_PLACES.indexOf(best) - from) ? other : best));
}

/**
 * @deprecated The ribbon with Projects as a place left of Inbox, kept until both frontends walk `FUNNEL_PLACES`
 * (`FunnelPlace`, `stepFunnel`, `funnelPlaceShowing`, `viewEntryLists`); then it goes.
 */
export type ScreenPlace = "projects" | FunnelPlace;

/** @deprecated `FUNNEL_PLACES`. */
export const SCREEN_PLACES: readonly ScreenPlace[] = ["projects", "inbox", "soon", "calendar"];

/** The funnel's lists each place shows, in its order (the deprecated Projects place none). */
export const SHOWN_LISTS: Readonly<Record<ScreenPlace, readonly DropColumn[]>> = { projects: [], inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] };

/** The funnel's lists `place` shows (`SHOWN_LISTS`), for a host that asks a rule rather than reading the constant. */
export function shownLists(place: ScreenPlace): readonly DropColumn[] {
	return SHOWN_LISTS[place];
}

/** @deprecated `viewEntryLists`. The lists a field can stand in that `place` shows, in its order: the Projects screen its own list, the others their funnel lists. */
export function shownEntryLists(place: ScreenPlace): readonly EntryList[] {
	return place === "projects" ? ["projects"] : SHOWN_LISTS[place];
}

/**
 * @deprecated `funnelPlaceShowing`. The place that shows `column`: `place` itself when it does, else the nearest that does, the left one of two as near;
 * from Projects as from Inbox, its neighbour. The Projects list shows only on Projects.
 */
export function placeShowing(column: EntryList, place: ScreenPlace): ScreenPlace {
	if (column === "projects") return "projects";
	const at: ScreenPlace = place === "projects" ? "inbox" : place;
	if (SHOWN_LISTS[at].includes(column)) return at;
	const from = SCREEN_PLACES.indexOf(at);
	const showing = SCREEN_PLACES.filter((other) => SHOWN_LISTS[other].includes(column));
	return showing.reduce((best, other) => (Math.abs(SCREEN_PLACES.indexOf(other) - from) < Math.abs(SCREEN_PLACES.indexOf(best) - from) ? other : best));
}

/** @deprecated `FunnelSpot`. Where a screen stands: one of the places, or Done between Projects and Inbox, which only the search opens. */
export type ScreenSpot = ScreenPlace | "done";

/** @deprecated `FunnelAt`. What the screen shows: its place and the day of its day column. */
export interface ScreenAt {
	readonly mode: ScreenSpot;
	readonly date: LocalDate;
}

/**
 * @deprecated `stepFunnel`. Where a swipe or an arrow leads, a step back (-1) or on (1): the screens stand in one row, Projects, Inbox and Soon,
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

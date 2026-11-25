import { DESIGN } from "../../shared/design";
import type { FunnelList, ListId } from "../port";
import type { Screen } from "../store";

/** Where the ribbon stands: Inbox–Soon, Soon–the day, the day–its calendar. */
export type Stop = "inbox" | "soon" | "calendar";
const STOPS: readonly Stop[] = ["inbox", "soon", "calendar"];

/** Where a screen is mounted: Obsidian's leaf (the main screen, a pop-out) or a note's block. */
export type Place = "leaf" | "note";

/** A row counts as this tall until it is drawn and measured, by the virtualizer and the drag alike: a card and its gap at the default size. */
export const ROW_PX = DESIGN.cardHeight + DESIGN.cardGap;

/** The strip of columns the ribbon slides, left to right: the first is Inbox over Backlog. */
export type Column = Exclude<FunnelList, "backlog"> | "timeline";
const STRIP: readonly Column[] = ["inbox", "soon", "day", "timeline"];

/** The lists a column of the strip shows: Inbox over Backlog in the first, one list in the others, none on the calendar. */
const LISTS_OF: Readonly<Record<Column, readonly ListId[]>> = { inbox: ["inbox", "backlog"], soon: ["soon"], day: ["day"], timeline: [] };

/** The ribbon's window shows two columns side by side. */
const SHOWN = 2;

/** The strip's width, in percent of the ribbon's window, and each column's, in percent of the strip. */
export const STRIP_WIDTH = (STRIP.length / SHOWN) * 100;
export const COLUMN_SHARE = 100 / STRIP.length;

/** The two columns a stop shows, left and right. */
export function shownAt(stop: Stop): readonly [Column, Column] {
	const at = stop === "inbox" ? 0 : stop === "soon" ? 1 : 2;
	return [STRIP[at], STRIP[at + 1]];
}

/** Every list, as the modes without the ribbon show them side by side or stacked (All columns, Rows; F16, F17). */
const ALL_LISTS: readonly ListId[] = ["inbox", "backlog", "soon", "day"];

/** How the main screen lays its lists out: the ribbon's two columns, every funnel list at once (All columns, Rows), or By project's one list. */
export type Lists = "ribbon" | "all" | "byProject";

/**
 * What each stop shows (the one place it is said): the lists a screen mounted at `place` shows at `stop`; a note's block
 * shows its Inbox alone; a mode that is no ribbon every list at once, By project its one list.
 */
export function columnsOf(place: Place, stop: Stop, lists: Lists = "ribbon"): readonly ListId[] {
	if (place === "note") return ["inbox"];
	if (lists === "byProject") return ["projects"];
	return lists === "ribbon" ? shownAt(stop).flatMap((column) => LISTS_OF[column]) : ALL_LISTS;
}

/** The lists a screen mounted at `place` can bring into sight: the ribbon turns to any; a note's block shows its Inbox. */
export function reachOf(place: Place, lists: Lists = "ribbon"): readonly ListId[] {
	return [...new Set(STOPS.flatMap((stop) => columnsOf(place, stop, lists)))];
}

/** How a view lays its lists out. */
export const listsOf = (view: { readonly mode: string; readonly ribbon: boolean }): Lists => (view.mode === "byProject" ? "byProject" : view.ribbon ? "ribbon" : "all");

/** The stop that brings `list` into sight from `stop`: the same while it shows it, else the last of the lists' own stops (Inbox–Soon, Soon–day) that does. */
export function stopShowing(stop: Stop, list: ListId): Stop {
	if (columnsOf("leaf", stop).includes(list)) return stop;
	return [...STOPS].reverse().find((other) => other !== "calendar" && columnsOf("leaf", other).includes(list)) ?? stop;
}

/** How far the strip stands from its start at a stop, in columns: where the ribbon's gestures take it. */
export const offsetOf = (stop: Stop): number => STRIP.indexOf(shownAt(stop)[0]);

/** The ribbon's last stop, the day and its calendar, in places: past it the places are the days, one a day. */
export const CALENDAR = offsetOf("calendar");

/** A day other than today stands past the calendar, where the days turn; at Inbox and Soon the day's list is today's (Decision 129). */
const dayAtStop = (stop: Stop, day: number): number => (stop === "calendar" ? day : 0);

/**
 * Where each day stands on the ribbon past the calendar (Decision 146): the stops, then one place a day from `origin`, the
 * day at the calendar's own place (today, or an earlier day the arrows went back to). For one turn a far day may stand
 * beside the day turned to (`alias`), so going back to today from a far day, or to a day picked far ahead, is one page,
 * not a run through the days between. A line stands as it should (`plain`) once the ribbon rests.
 */
export class DayLine {
	private constructor(
		private readonly origin: number,
		private readonly alias: { readonly day: number; readonly at: number } | null,
	) {}

	/** The line the ribbon rests on with `day` shown: today at the calendar, or a day before it there. */
	static plain(day: number): DayLine {
		return new DayLine(Math.min(0, day), null);
	}

	/** Whether this is the line `plain(day)` gives. */
	isPlain(day: number): boolean {
		return this.alias === null && this.origin === Math.min(0, day);
	}

	/** How many days past the calendar `day`'s page stands. */
	pos(day: number): number {
		return this.alias?.day === day ? this.alias.at : day - this.origin;
	}

	/** Where the ribbon stands, in places, at `stop` showing `day`. */
	placeOf(stop: Stop, day: number): number {
		return stop === "calendar" ? CALENDAR + this.pos(day) : offsetOf(stop);
	}

	/** The day a place shows: past the calendar its page's, at Inbox and Soon today. */
	dayAt(place: number): number {
		if (place < CALENDAR) return 0;
		const at = Math.round(place - CALENDAR);
		return this.alias?.at === at ? this.alias.day : at + this.origin;
	}

	/** The ribbon stood at `place` (never before the first): the stop, and past the calendar the day, the screen shows from now on. */
	standAt(screen: Pick<Screen, "setStop" | "showDay">, place: number): void {
		const at = Math.max(0, place);
		screen.setStop(STOPS.find((stop) => offsetOf(stop) === Math.min(at, CALENDAR)) ?? "calendar");
		screen.showDay(this.dayAt(at));
	}

	/**
	 * The line a turn from the ribbon's place `from` to `stop` and `day` runs on: an earlier day than the calendar's own
	 * becomes it; a day further than the next from where the ribbon stands is drawn beside it, the one way it lies.
	 */
	toward(from: number, stop: Stop, day: number): DayLine {
		if (stop !== "calendar") return DayLine.plain(0);
		const base = new DayLine(Math.min(this.origin, day), null);
		const shown = from >= CALENDAR ? this.dayAt(from) : null;
		if (shown === null) return base.pos(day) > 1 ? new DayLine(base.origin, { day, at: 1 }) : base;
		const apart = base.pos(day) - base.pos(shown);
		return Math.abs(apart) > 1 ? new DayLine(base.origin, { day: shown, at: base.pos(day) - Math.sign(apart) }) : base;
	}

	/** `place` on this line as it stands on `next`: the same day at the same fraction of the way to the next. */
	moved(place: number, next: DayLine): number {
		if (place < CALENDAR) return place;
		const at = Math.round(place - CALENDAR);
		return next.placeOf("calendar", this.dayAt(place)) + (place - CALENDAR - at);
	}
}

/** The ribbon stood at a stop's place (the wheel's tap and turn): that stop, today's list beside it, on the line it rests on. */
export const standAt = (screen: Pick<Screen, "setStop" | "showDay">, place: number): void => DayLine.plain(0).standAt(screen, place);

/** Where the ribbon stands at a stop and day on the line it rests on: the stops' offsets, past the calendar one place a day. */
export const placeOf = (stop: Stop, dayOffset: number): number => DayLine.plain(dayOffset).placeOf(stop, dayAtStop(stop, dayOffset));

/** A step on or back as a swipe takes it (the keys ← and →): Inbox, Soon, the day's calendar, then a day a step; back from today's calendar or an earlier day to Soon. */
export function stepped(stop: Stop, day: number, shift: -1 | 1): { readonly stop: Stop; readonly day: number } {
	if (stop === "calendar" && (shift > 0 || day > 0)) return { stop, day: day + shift };
	const at = Math.min(Math.max(0, STOPS.indexOf(stop) + shift), STOPS.length - 1);
	return { stop: STOPS[at], day: 0 };
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
	return `calc(${COLUMN_SHARE}% + ${toward} * (var(--tc-ribbon-list-width) + var(--tc-divider) / 2 - ${COLUMN_SHARE}%))`;
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

/**
 * The ribbon's and its calendar's widths as the browser draws them, read as a gesture needs them (as @use-gesture's pager
 * example reads the window's): the one place the screen reads them. Before the calendar is drawn, half the ribbon.
 */
export function drawnWidths(ribbon: HTMLElement | null, calendar: HTMLElement | null): { readonly view: number; readonly calendar: number } {
	const view = ribbon?.clientWidth ?? 0;
	return { view, calendar: calendar?.clientWidth ?? view / 2 };
}

/** How wide a place is drawn, px: a stop's step is half the ribbon; past the calendar a day is the day list's column. */
export interface PlaceWidths {
	readonly stop: number;
	readonly day: number;
}

const pxOf = (place: number, w: PlaceWidths): number => (place <= CALENDAR ? place * w.stop : CALENDAR * w.stop + (place - CALENDAR) * w.day);
const placeOfPx = (px: number, w: PlaceWidths): number => (px <= CALENDAR * w.stop ? px / w.stop : CALENDAR + (px - CALENDAR * w.stop) / w.day);

/**
 * The place `px` of fingers on from `base`, each place as wide as it is drawn, so the columns and the day's pages stay
 * under the fingers on either side of the calendar, whatever width the divider gave the list. On one side it is the
 * pager's own count, `base + px / width`.
 */
export function placesAfter(base: number, px: number, w: PlaceWidths): number {
	const edge = CALENDAR * w.stop;
	const from = pxOf(base, w);
	const to = from + px;
	if (from <= edge && to <= edge) return base + px / w.stop;
	if (from >= edge && to >= edge) return base + px / w.day;
	return placeOfPx(to, w);
}

/** The px a place counts for a landing from `from` to `to`: a day's past the calendar, else a stop's. */
export const landingWidth = (from: number, to: number, w: PlaceWidths): number => (Math.max(from, to) > CALENDAR ? w.day : w.stop);

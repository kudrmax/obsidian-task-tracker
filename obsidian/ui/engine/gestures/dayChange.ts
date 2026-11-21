import { easeIn, easeOut } from "motion/react";

/**
 * The calendar's day changing as the day's list lands on another day (Max, 2026-11-21; Decision 127): the quick switch
 * he liked, timed by the list's own landing. The day going out nudges `SHIFT` of its width the way the list went and
 * fades; then the day coming in appears from `SHIFT` on the other side and fades in, its nudge riding the list's
 * remaining way, so both stand still on the same frame. Never both in sight.
 */
export interface DayChange {
	readonly from: number;
	readonly to: number;
	/** 1 to a later day (the list went left), -1 to an earlier one. */
	readonly way: number;
}

/** How far a day nudges as the calendar changes day, in widths of its room. */
export const SHIFT = 0.06;
/** The day going out fades in this long, s, as the switch Max liked; a shorter landing shortens it. */
const OUT_S = 0.06;
/** The day coming in fades in this long, s. */
const IN_S = 0.1;
/** The going out's share of a landing too short for both. */
const OUT_SHARE = 0.375;

/** The switch's times for a landing of `durationS`: as Max saw them, shortened to end with the landing. */
export interface ChangeTiming {
	readonly outS: number;
	readonly inS: number;
}

export function changeTiming(durationS: number): ChangeTiming {
	const outS = Math.min(OUT_S, OUT_SHARE * durationS);
	return { outS, inS: Math.max(0, Math.min(IN_S, durationS - outS)) };
}

export interface DayLook {
	/** In widths of the calendar's room. */
	readonly x: number;
	readonly opacity: number;
}

/**
 * The two days `timeS` into the landing, the list `landed` of its way there (0 to 1) and `landedAtOut` of it as the old
 * day was gone. At `landed` 1 the new day stands whole in its place, on the list's last frame.
 */
export function changeLook(change: DayChange, timing: ChangeTiming, timeS: number, landed: number, landedAtOut: number): { readonly out: DayLook; readonly in: DayLook } {
	if (landed >= 1) return { out: { x: -change.way * SHIFT, opacity: 0 }, in: { x: 0, opacity: 1 } };
	const going = timing.outS > 0 ? Math.min(1, Math.max(0, timeS / timing.outS)) : 1;
	if (going < 1) return { out: { x: -change.way * SHIFT * easeIn(going), opacity: 1 - easeIn(going) }, in: { x: change.way * SHIFT, opacity: 0 } };
	const coming = timing.inS > 0 ? Math.min(1, Math.max(0, (timeS - timing.outS) / timing.inS)) : 1;
	const left = landedAtOut < 1 ? Math.min(1, Math.max(0, (1 - landed) / (1 - landedAtOut))) : 0;
	return { out: { x: -change.way * SHIFT, opacity: 0 }, in: { x: change.way * SHIFT * left, opacity: easeOut(coming) } };
}

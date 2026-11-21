/**
 * The calendar's day changing as the day's list lands on another day (Max, 2026-11-21; Decision 127): the shown day slides
 * out of the calendar's room, then the new day slides in, never both in sight, no dimming. Both ride the list's own
 * landing: `progress` 0 is where it began, 1 where the list stands still, so the calendar comes to rest on the frame the
 * list does. `outWay` is the side the day going out leaves by, `inWay` the side the day coming in enters from (-1 left).
 */
export interface DayChange {
	readonly from: number;
	readonly to: number;
	readonly outWay: number;
	readonly inWay: number;
}

/** Where the two days stand at `progress`, in widths of the calendar's room: the first half takes the old day out, the second brings the new one in. */
export function changeOffsets(change: DayChange, progress: number): { readonly from: number; readonly to: number } {
	return { from: change.outWay * Math.min(1, 2 * progress), to: change.inWay * Math.min(1, 2 - 2 * progress) };
}

/**
 * The change toward `target` from where the calendar stands: `change` under way at `progress`, or settled on `shown`.
 * A landing that takes the list on keeps what is in sight where it is: back to the day going out, the two trade places;
 * to a third day, the day in sight (the old one while it still shows, else the new one going back the way it came) goes
 * out and the third comes in.
 */
export function retarget(change: DayChange | null, progress: number, shown: number, target: number): { readonly change: DayChange | null; readonly progress: number } {
	if (!change) return target === shown ? { change: null, progress: 1 } : { change: { from: shown, to: target, outWay: -Math.sign(target - shown), inWay: Math.sign(target - shown) }, progress: 0 };
	if (target === change.to) return { change, progress };
	if (target === change.from) return { change: { from: change.to, to: change.from, outWay: change.inWay, inWay: change.outWay }, progress: 1 - progress };
	if (progress < 0.5) return { change: { from: change.from, to: target, outWay: change.outWay, inWay: Math.sign(target - change.from) }, progress };
	return { change: { from: change.to, to: target, outWay: change.inWay, inWay: Math.sign(target - change.to) }, progress: 1 - progress };
}

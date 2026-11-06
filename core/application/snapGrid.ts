import { MINUTES_PER_DAY } from "../domain/LocalDate";

const MINUTES_PER_HOUR = 60;
/** The steps a drag, a drop and a stretch snap to, finest first: 10 is left out, since tasks start at :15 and :45 more than at :10. */
const SNAP_STEPS: readonly number[] = [5, 15, 30, 60];
/**
 * The step at this hour's height: the finest one a finger moves by at least `tolerance` for, in the frontend's own units
 * (its touch tolerance: under it the snapped time would flicker between neighbours).
 */
export function snapStep(hourPx: number, tolerance: number): number {
	return SNAP_STEPS.find((minutes) => (minutes / MINUTES_PER_HOUR) * hourPx >= tolerance) ?? SNAP_STEPS[SNAP_STEPS.length - 1];
}

/** The nearest step to `minute`, within the day. */
export function snapMinute(minute: number, hourPx: number, tolerance: number): number {
	const step = snapStep(hourPx, tolerance);
	return Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(minute / step) * step));
}

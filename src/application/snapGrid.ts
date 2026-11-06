import { MINUTES_PER_DAY } from "../domain/LocalDate";

const MINUTES_PER_HOUR = 60;
/** The steps a drag, a drop and a stretch snap to, finest first: 10 is left out, since tasks start at :15 and :45 more than at :10. */
const SNAP_STEPS: readonly number[] = [5, 15, 30, 60];
/** The least a finger moves for one step, in the frontend's pixels: under this the snapped time would flicker between neighbours. */
const SNAP_STEP_PX = 9;

/** The step at this hour's height: the finest one a finger still moves by without jitter. */
export function snapStep(hourPx: number): number {
	return SNAP_STEPS.find((minutes) => (minutes / MINUTES_PER_HOUR) * hourPx >= SNAP_STEP_PX) ?? SNAP_STEPS[SNAP_STEPS.length - 1];
}

/** The nearest step to `minute`, within the day. */
export function snapMinute(minute: number, hourPx: number): number {
	const step = snapStep(hourPx);
	return Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(minute / step) * step));
}

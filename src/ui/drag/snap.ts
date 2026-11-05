import { MINUTES_PER_DAY } from "../../application/contracts";

/** The nearest grid step, within the day. */
export function snapMinutes(minutes: number, step: number): number {
	return Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(minutes / step) * step));
}

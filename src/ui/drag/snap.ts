import { LAYOUT } from "../design";

/** The nearest grid step, within the day. */
export function snapMinutes(minutes: number, step: number): number {
	return Math.min(LAYOUT.minutesPerDay, Math.max(0, Math.round(minutes / step) * step));
}

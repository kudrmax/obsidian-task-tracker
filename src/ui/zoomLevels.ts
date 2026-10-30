import type { ZoomLevel } from "../settings";
import { LAYOUT } from "./design";
import { minutesToPx } from "./timelineLayout";

export function nearestLevel(hourPx: number, levels: readonly ZoomLevel[]): ZoomLevel {
	return levels.reduce((best, level) => (Math.abs(level.hourPx - hourPx) < Math.abs(best.hourPx - hourPx) ? level : best));
}

/** The drag, resize and drop step at this hour's height: the finest one a finger still moves by without jitter. */
export function stepFor(hourPx: number): number {
	return LAYOUT.snapSteps.find((minutes) => minutesToPx(minutes, hourPx) >= LAYOUT.snapStepPx) ?? LAYOUT.snapSteps[LAYOUT.snapSteps.length - 1];
}

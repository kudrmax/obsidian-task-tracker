import type { ZoomLevel } from "../application/contracts";
import { LAYOUT } from "./design";
import { minutesToPx } from "./timelineLayout";

/** The levels at this height of the screen, whose ends bound a pinch: the first one, `wholeDayPx`, shows the whole day; it takes the smallest one's place, and those it would leave room under drop. */
export function levelsFor(wholeDayPx: number, levels: readonly ZoomLevel[]): ZoomLevel[] {
	const closer = [...levels].sort((a, b) => a.hourPx - b.hourPx).slice(1).filter((level) => level.hourPx > wholeDayPx);
	return [{ hourPx: wholeDayPx }, ...closer];
}

/** The drag, resize and drop step at this hour's height: the finest one a finger still moves by without jitter. */
export function stepFor(hourPx: number): number {
	return LAYOUT.snapSteps.find((minutes) => minutesToPx(minutes, hourPx) >= LAYOUT.snapStepPx) ?? LAYOUT.snapSteps[LAYOUT.snapSteps.length - 1];
}

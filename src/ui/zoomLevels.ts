import type { ZoomLevel } from "./viewSettings";

/** The levels at this height of the screen, whose ends bound a pinch: the first one, `wholeDayPx`, shows the whole day; it takes the smallest one's place, and those it would leave room under drop. */
export function levelsFor(wholeDayPx: number, levels: readonly ZoomLevel[]): ZoomLevel[] {
	const closer = [...levels].sort((a, b) => a.hourPx - b.hourPx).slice(1).filter((level) => level.hourPx > wholeDayPx);
	return [{ hourPx: wholeDayPx }, ...closer];
}

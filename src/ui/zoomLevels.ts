import type { ZoomLevel } from "../settings";

export function nearestLevel(hourPx: number, levels: readonly ZoomLevel[]): ZoomLevel {
	return levels.reduce((best, level) => (Math.abs(level.hourPx - hourPx) < Math.abs(best.hourPx - hourPx) ? level : best));
}

/** The drag, resize and drop step at this zoom: the nearest level's. */
export function stepFor(hourPx: number, levels: readonly ZoomLevel[]): number {
	return nearestLevel(hourPx, levels).stepMinutes;
}

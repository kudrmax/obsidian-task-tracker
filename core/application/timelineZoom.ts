/** A level of the timeline's zoom: the height of one hour, in the frontend's units. */
export interface ZoomLevel {
	readonly hourPx: number;
}

/** The levels a settings file without its own gives: from the whole day to the closest hour. */
export const DEFAULT_ZOOM_LEVELS: readonly ZoomLevel[] = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];

/** The zoom a timeline opens at the first time, before a pinch has settled on another. */
export const DEFAULT_ZOOM_HOUR = 56;

/** Reads the heights; the old text with a step after each one (`56:30`) still reads, the step dropped. */
export function parseZoomLevels(text: string): ZoomLevel[] | null {
	const levels: ZoomLevel[] = [];
	for (const part of text.split(",")) {
		const m = /^\s*(\d+)\s*(?::\s*\d+\s*)?$/.exec(part);
		if (!m) return null;
		const hourPx = Number(m[1]);
		if (hourPx <= 0) return null;
		levels.push({ hourPx });
	}
	return levels.length > 0 ? levels : null;
}

export function formatZoomLevels(levels: readonly ZoomLevel[]): string {
	return levels.map((l) => String(l.hourPx)).join(", ");
}

/** The levels at this height of the screen, whose ends bound a pinch: the first one, `wholeDayPx`, shows the whole day; it takes the smallest one's place, and those it would leave room under drop. */
export function levelsFor(wholeDayPx: number, levels: readonly ZoomLevel[]): ZoomLevel[] {
	const closer = [...levels].sort((a, b) => a.hourPx - b.hourPx).slice(1).filter((level) => level.hourPx > wholeDayPx);
	return [{ hourPx: wholeDayPx }, ...closer];
}

/** The frontend's measures the grid is laid out by: which divisions of the hour may be labelled, finest first, and how far apart labels and lines must stand. */
export interface GridMeasures {
	readonly divisions: readonly number[];
	readonly labelGap: number;
	readonly tickMinutes: number;
	readonly tickGap: number;
}

/** The minutes between the grid's labelled lines and between all its lines. */
export interface Grid {
	readonly labels: number;
	readonly lines: number;
}

const MINUTES_PER_HOUR = 60;

/** The grid at this zoom: labels at the finest division that still has room for them, else the hour; lines as often as they stay apart. */
export function gridAt(hourPx: number, measures: GridMeasures): Grid {
	const px = (minutes: number) => (minutes / MINUTES_PER_HOUR) * hourPx;
	const labels = measures.divisions.find((minutes) => px(minutes) >= measures.labelGap) ?? MINUTES_PER_HOUR;
	const ticks = px(measures.tickMinutes) >= measures.tickGap;
	return { labels, lines: ticks ? measures.tickMinutes : labels };
}

/** A grid line between the hours: its minute, and its label (`:15`) when it is a labelled one. */
export interface GridMark {
	readonly minute: number;
	readonly label: string | null;
}

/** Every line between the hours of a day `dayHours` long at this grid, the hours themselves left out. */
export function gridMarks(grid: Grid, dayHours: number): GridMark[] {
	const marks: GridMark[] = [];
	for (let minutes = grid.lines; minutes < dayHours * MINUTES_PER_HOUR; minutes += grid.lines) {
		const minute = minutes % MINUTES_PER_HOUR;
		if (minute === 0) continue;
		marks.push({ minute: minutes, label: minute % grid.labels === 0 ? `:${String(minute).padStart(2, "0")}` : null });
	}
	return marks;
}

/** The levels `data.json` keeps under `zoomLevels`, each only its height; the defaults when it keeps none, or one doesn't read. */
export function zoomLevelsOf(saved: unknown): ZoomLevel[] {
	const kept = saved !== null && typeof saved === "object" ? (saved as { zoomLevels?: unknown }).zoomLevels : undefined;
	if (!Array.isArray(kept) || kept.length === 0) return [...DEFAULT_ZOOM_LEVELS];
	const levels = kept.map((level) => (level !== null && typeof level === "object" ? (level as { hourPx?: unknown }).hourPx : undefined));
	if (!levels.every((hourPx): hourPx is number => typeof hourPx === "number" && Number.isFinite(hourPx) && hourPx > 0)) return [...DEFAULT_ZOOM_LEVELS];
	return levels.map((hourPx) => ({ hourPx }));
}

/** Where a timeline was left: an hour's height, or the whole day, whatever the screen's height. */
export type Zoom = number | "wholeDay";

/** The whole day's hour height, or the smallest level's while the timeline has no height to fit the day in. */
function wholeDayOr(wholeDayPx: number | null, levels: readonly ZoomLevel[]): number {
	return wholeDayPx ?? Math.min(...levels.map((level) => level.hourPx));
}

/** The zoom a pinch let go at `hourPx` settles on: the whole day at or under its height, else the height itself. */
export function zoomAfterPinch(hourPx: number, wholeDayPx: number | null, levels: readonly ZoomLevel[]): Zoom {
	return hourPx <= levelsFor(wholeDayOr(wholeDayPx, levels), levels)[0].hourPx ? "wholeDay" : hourPx;
}

/** The hour height a saved zoom opens at: the whole day's, or the saved height kept between the pinch's ends; the default zoom for a saved one that doesn't read. */
export function zoomShown(saved: unknown, wholeDayPx: number | null, levels: readonly ZoomLevel[]): number {
	const ends = levelsFor(wholeDayOr(wholeDayPx, levels), levels);
	const [min, max] = [ends[0].hourPx, ends[ends.length - 1].hourPx];
	if (saved === "wholeDay") return min;
	const hourPx = typeof saved === "number" && Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_ZOOM_HOUR;
	return Math.min(max, Math.max(min, hourPx));
}

/** Whether a grid label at `y` hides under the now pill at `nowY` (null on a day with no now line): closer than its lift and half the pill. */
export function labelHidesNearNow(y: number, nowY: number | null, lift: number, pillHeight: number): boolean {
	return nowY !== null && Math.abs(y - nowY) < lift + pillHeight / 2;
}

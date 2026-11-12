/** The bounds of the list column's width beside the calendar on a phone: the design's. */
export const LIST_WIDTHS = { min: 110, max: 280 } as const;

/** The list column's width for a window, every number in the window's px or points. */
export interface ListWidths {
	/** The width the list is drawn at: its share of the columns' width, within `min` and `max`. */
	readonly width: number;
	/** How narrow and how wide a drag of the divider may make it. */
	readonly min: number;
	readonly max: number;
	/** The width that puts the divider's line in the middle of the window. */
	readonly center: number;
}

/**
 * The list column beside the calendar, as `share` of the width the two columns split (`viewWidth` less the divider's
 * own `dividerWidth`): on a phone within the design's bounds; a wider window lets it grow until the timeline is as narrow
 * as the list may be.
 */
export function listWidths(share: number, viewWidth: number, dividerWidth: number): ListWidths {
	const columns = viewWidth - dividerWidth;
	const max = Math.max(LIST_WIDTHS.max, columns - LIST_WIDTHS.min);
	return { width: Math.min(max, Math.max(LIST_WIDTHS.min, share * columns)), min: LIST_WIDTHS.min, max, center: columns / 2 };
}

/** The share of the columns' width a list `width` wide takes: what a divider let go at `width` saves. */
export function listShareOf(width: number, viewWidth: number, dividerWidth: number): number {
	return width / (viewWidth - dividerWidth);
}

/** How a drag of the divider holds to the middle: brought within `distance` of it slower than `slowSpeed` (px or points per ms). */
export const DIVIDER_SNAP = { distance: 8, slowSpeed: 0.08 } as const;

/** Where a dragged divider stands: the width the list is drawn at, and whether it holds to the middle there. */
export interface DividerStop {
	readonly width: number;
	readonly snapped: boolean;
}

/**
 * The divider dragged to make the list `wanted` wide, the finger moving at `speed` (px or points per ms): brought slowly
 * near the middle, it holds to it (`center`, when the bounds reach it); else it stands where the finger asks, whole, within
 * `min` and `max`. A frontend gives a tap of haptics when `snapped` turns on.
 */
export function dividerAt(wanted: number, widths: ListWidths, speed: number): DividerStop {
	const reachable = widths.center >= widths.min && widths.center <= widths.max;
	const snapped = reachable && speed < DIVIDER_SNAP.slowSpeed && Math.abs(wanted - widths.center) <= DIVIDER_SNAP.distance;
	const width = snapped ? widths.center : Math.round(wanted);
	return { width: Math.min(widths.max, Math.max(widths.min, width)), snapped };
}

/**
 * All columns (a wide screen): Inbox, Soon and the day's list, each `width` wide, then the timeline behind the divider,
 * `dividerWidth` between each two. The share the divider saves is one list's against the timeline, so at the middle share
 * the four columns are equal; the timeline keeps at least a list's least width.
 */
export function allColumnsWidths(share: number, viewWidth: number, dividerWidth: number): ListWidths {
	const room = viewWidth - 3 * dividerWidth;
	const max = Math.max(LIST_WIDTHS.min, (room - LIST_WIDTHS.min) / 3);
	const width = Math.min(max, Math.max(LIST_WIDTHS.min, (share * room) / (1 + 2 * share)));
	return { width, min: LIST_WIDTHS.min, max, center: room / 4 };
}

/** The share all columns' lists `width` wide save: one list's against the timeline. */
export function allColumnsShare(width: number, viewWidth: number, dividerWidth: number): number {
	const timeline = viewWidth - 3 * dividerWidth - 3 * width;
	return width + timeline > 0 ? width / (width + timeline) : 0.5;
}

/** Where the divider stands in all columns, from the view's left: after the three lists and the dividers between them. */
export function allColumnsDividerAt(width: number, dividerWidth: number): number {
	return 3 * width + 2 * dividerWidth;
}

/** The lists' width the divider standing at `at` gives in all columns. */
export function allColumnsWidthAt(at: number, dividerWidth: number): number {
	return (at - 2 * dividerWidth) / 3;
}

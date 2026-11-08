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

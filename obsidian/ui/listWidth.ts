import { LIST_WIDTHS, listShareOf as shareOf, listWidths } from "../../core/application/contracts";
import { DESIGN } from "./design";

/** On a phone the list keeps the design's bounds; a wider window lets it grow until the timeline is as narrow as the list may be. */
export function listWidthMax(viewWidth: number): number {
	return listWidths(0, viewWidth, DESIGN.dividerWidth).max;
}

/** The list's share of the columns' width, in px for this window and within the list's bounds. */
export function shownListWidth(share: number, viewWidth: number): number {
	return listWidths(share, viewWidth, DESIGN.dividerWidth).width;
}

/** The share of the columns' width a list this wide takes. */
export function listShareOf(width: number, viewWidth: number): number {
	return shareOf(width, viewWidth, DESIGN.dividerWidth);
}

/** The width that puts the divider's line in the middle of the window, where the two columns are equal. */
export function centeredListWidth(viewWidth: number): number {
	return listWidths(0, viewWidth, DESIGN.dividerWidth).center;
}

/**
 * All columns (desktop): Inbox, Soon and the day's list, each `width` wide, then the timeline behind the divider. The
 * share the divider saves is one list's against the timeline, so at the middle share the four columns are equal; the
 * timeline keeps at least a list's least width.
 */
export function allColumnsWidths(share: number, viewWidth: number): { readonly width: number; readonly min: number; readonly max: number; readonly center: number } {
	const room = viewWidth - 3 * DESIGN.dividerWidth;
	const max = Math.max(LIST_WIDTHS.min, (room - LIST_WIDTHS.min) / 3);
	const width = Math.min(max, Math.max(LIST_WIDTHS.min, (share * room) / (1 + 2 * share)));
	return { width, min: LIST_WIDTHS.min, max, center: room / 4 };
}

/** The share all columns' lists `width` wide save: one list's against the timeline. */
export function allColumnsShare(width: number, viewWidth: number): number {
	const timeline = viewWidth - 3 * DESIGN.dividerWidth - 3 * width;
	return width + timeline > 0 ? width / (width + timeline) : 0.5;
}

/** Where the divider stands in all columns, from the view's left: after the three lists and the dividers between them. */
export function allColumnsDividerAt(width: number): number {
	return 3 * width + 2 * DESIGN.dividerWidth;
}

/** The lists' width the divider standing at `at` gives in all columns. */
export function allColumnsWidthAt(at: number): number {
	return (at - 2 * DESIGN.dividerWidth) / 3;
}

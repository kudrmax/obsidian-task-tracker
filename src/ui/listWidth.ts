import { LIST_WIDTH_MAX, LIST_WIDTH_MIN } from "../settings";
import { DESIGN } from "./design";

/** On a phone the list keeps the design's bounds; a wider window lets it grow until the timeline is as narrow as the list may be. */
export function listWidthMax(viewWidth: number): number {
	return Math.max(LIST_WIDTH_MAX, viewWidth - DESIGN.dividerWidth - LIST_WIDTH_MIN);
}

/** The list's share of the columns' width, in px for this window and within the list's bounds. */
export function shownListWidth(share: number, viewWidth: number): number {
	return Math.min(listWidthMax(viewWidth), Math.max(LIST_WIDTH_MIN, share * columnsWidth(viewWidth)));
}

/** The share of the columns' width a list this wide takes. */
export function listShareOf(width: number, viewWidth: number): number {
	return width / columnsWidth(viewWidth);
}

/** The width that puts the divider's line in the middle of the window, where the two columns are equal. */
export function centeredListWidth(viewWidth: number): number {
	return columnsWidth(viewWidth) / 2;
}

function columnsWidth(viewWidth: number): number {
	return viewWidth - DESIGN.dividerWidth;
}

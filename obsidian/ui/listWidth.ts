import { listShareOf as shareOf, listWidths } from "../../core/application/contracts";
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

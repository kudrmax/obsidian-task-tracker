import { LIST_WIDTH_MAX, LIST_WIDTH_MIN } from "../settings";
import { DESIGN } from "./design";

/** On a phone the list keeps the design's bounds; a wider window lets it grow until the timeline is as narrow as the list may be. */
export function listWidthMax(viewWidth: number): number {
	return Math.max(LIST_WIDTH_MAX, viewWidth - DESIGN.dividerWidth - LIST_WIDTH_MIN);
}

/** The saved width, narrowed to the window it is shown in; a view not laid out yet has no width to fit. */
export function shownListWidth(saved: number, viewWidth: number): number {
	return viewWidth > 0 ? Math.min(saved, listWidthMax(viewWidth)) : saved;
}

/** The width that puts the divider's line in the middle of the window, where the two columns are equal. */
export function centeredListWidth(viewWidth: number): number {
	return (viewWidth - DESIGN.dividerWidth) / 2;
}

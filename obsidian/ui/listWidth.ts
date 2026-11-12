import {
	allColumnsDividerAt as coreAllColumnsDividerAt,
	allColumnsShare as coreAllColumnsShare,
	allColumnsWidthAt as coreAllColumnsWidthAt,
	allColumnsWidths as coreAllColumnsWidths,
	listShareOf as shareOf,
	type ListWidths,
	listWidths,
} from "../../core/application/contracts";
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

/** All columns (desktop): the core's widths (`allColumnsWidths`), with the plugin's divider. */
export function allColumnsWidths(share: number, viewWidth: number): ListWidths {
	return coreAllColumnsWidths(share, viewWidth, DESIGN.dividerWidth);
}

export function allColumnsShare(width: number, viewWidth: number): number {
	return coreAllColumnsShare(width, viewWidth, DESIGN.dividerWidth);
}

export function allColumnsDividerAt(width: number): number {
	return coreAllColumnsDividerAt(width, DESIGN.dividerWidth);
}

export function allColumnsWidthAt(at: number): number {
	return coreAllColumnsWidthAt(at, DESIGN.dividerWidth);
}

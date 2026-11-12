import type { DropColumn, ViewMode } from "./contracts";
import { allColumnsDividerAt, allColumnsShare, allColumnsWidthAt, allColumnsWidths, listShareOf, type ListWidths, listWidths } from "./listWidth";
import type { EntryList } from "./screenPlaces";
import { ROW_LISTS } from "./viewModes";

/** A column of a view: the funnel's (Inbox over Backlog, Soon, the day), the rows' stack, the node's by project list, the timeline. */
export type LayoutColumnId = "inbox" | "soon" | "day" | "timeline" | "rows" | "projects";

/**
 * How wide a column stands: `list` the list's width the divider sets (`layoutWidths`), `rest` what the others leave, `half`
 * half the screen (the ribbon at Inbox and Soon; its own rule decides by its place).
 */
export type LayoutWidth = "half" | "list" | "rest";

/** A list a column draws, top to bottom, and its title: the list's name; null for the day's list (the day's own title) and the by project list. */
export interface LayoutList {
	readonly list: EntryList;
	readonly title: string | null;
}

export interface LayoutColumn {
	readonly id: LayoutColumnId;
	readonly lists: readonly LayoutList[];
	readonly width: LayoutWidth;
}

/** The rows' stack: its lists top to bottom; each scrolls inside its share (`stackedLists`), or, in a note's block, grows with its cards. */
export interface LayoutStack {
	readonly lists: readonly DropColumn[];
	readonly scrolls: boolean;
}

/** How a view mode stands on the screen: one answer every frontend draws, never its own checks of the mode. */
export interface ViewLayout {
	readonly mode: ViewMode;
	/** Left to right. */
	readonly columns: readonly LayoutColumn[];
	/** `pages`: the ribbon a swipe and the wheel turn (two columns); `none`: the screen stands still, no swipe or rubber-band. */
	readonly swipe: "pages" | "none";
	/** The divider stands before the timeline and sets the list's width (`layoutWidths`, `layoutShareAt`). */
	readonly divider: boolean;
	/** The rows mode's stack; null in another mode. */
	readonly stack: LayoutStack | null;
}

/** The columns of a mode, the list's name given by `title` (null: the list draws its own, the day's). */
export function viewLayout(mode: ViewMode, note: boolean, title: (list: DropColumn) => string | null): ViewLayout {
	const of = (lists: readonly DropColumn[]): LayoutList[] => lists.map((list) => ({ list, title: title(list) }));
	const timeline: readonly LayoutColumn[] = note ? [] : [{ id: "timeline", lists: [], width: "rest" }];
	const lead: LayoutWidth = note ? "rest" : "list";
	const still = { mode, swipe: "none" as const, divider: !note };
	if (mode === "twoColumns") {
		return {
			mode,
			swipe: "pages",
			divider: true,
			stack: null,
			columns: [
				{ id: "inbox", lists: of(["inbox", "backlog"]), width: "half" },
				{ id: "soon", lists: of(["soon"]), width: "half" },
				{ id: "day", lists: of(["day"]), width: "list" },
				...timeline,
			],
		};
	}
	if (mode === "allColumns") {
		return {
			...still,
			stack: null,
			columns: [
				{ id: "inbox", lists: of(["inbox", "backlog"]), width: "list" },
				{ id: "soon", lists: of(["soon"]), width: "list" },
				{ id: "day", lists: of(["day"]), width: "list" },
				...timeline,
			],
		};
	}
	if (mode === "rows") return { ...still, stack: { lists: ROW_LISTS, scrolls: !note }, columns: [{ id: "rows", lists: of(ROW_LISTS), width: lead }, ...timeline] };
	return { ...still, stack: null, columns: [{ id: "projects", lists: [{ list: "projects", title: null }], width: lead }, ...timeline] };
}

/** Each column's width, left to right, and where the divider stands with its bounds (`width` its place from the left; `dividerAt` takes it as it is). */
export interface LayoutWidths {
	readonly widths: readonly number[];
	readonly divider: ListWidths | null;
}

/**
 * The columns' widths for a still layout at the saved `share` in a view `viewWidth` wide, `dividerWidth` the divider's
 * own: one list beside the timeline as `listWidths`; all columns' three lists as `allColumnsWidths`; a note's block the
 * whole width. Null for the ribbon (`swipe: "pages"`), whose own rule sets its columns by its place.
 */
export function layoutWidths(layout: ViewLayout, share: number, viewWidth: number, dividerWidth: number): LayoutWidths | null {
	if (layout.swipe === "pages") return null;
	if (!layout.divider) return { widths: layout.columns.map(() => viewWidth / layout.columns.length), divider: null };
	if (layout.mode === "allColumns") {
		const all = allColumnsWidths(share, viewWidth, dividerWidth);
		const at = (width: number) => allColumnsDividerAt(width, dividerWidth);
		return {
			widths: [all.width, all.width, all.width, viewWidth - 3 * dividerWidth - 3 * all.width],
			divider: { width: at(all.width), min: at(all.min), max: at(all.max), center: at(all.center) },
		};
	}
	const list = listWidths(share, viewWidth, dividerWidth);
	return { widths: [list.width, viewWidth - dividerWidth - list.width], divider: list };
}

/** The share a divider let go at `at` (from the view's left) saves in this layout; null where there is no divider or it is the ribbon's. */
export function layoutShareAt(layout: ViewLayout, at: number, viewWidth: number, dividerWidth: number): number | null {
	if (layout.swipe === "pages" || !layout.divider) return null;
	if (layout.mode === "allColumns") return allColumnsShare(allColumnsWidthAt(at, dividerWidth), viewWidth, dividerWidth);
	return listShareOf(at, viewWidth, dividerWidth);
}

import type { ListId, ViewMode } from "../port";

/** A column of the screen: Inbox over Backlog, Soon, the day's list, the lists stacked as rows, by project, the timeline. */
export type ColumnId = "inbox" | "soon" | "day" | "rows" | "projects" | "timeline";

/** How the screen stands in a mode: its columns left to right; the ribbon of two columns or a still screen; the divider before the timeline. */
export interface Layout {
	readonly columns: readonly ColumnId[];
	readonly ribbon: boolean;
	readonly divider: boolean;
}

/** The rows' lists, top to bottom. */
export const ROW_LISTS: readonly ListId[] = ["inbox", "backlog", "soon", "day"];

/** The columns of `mode`; a note's block has no timeline and shows its one column the whole width. */
export function layoutOf(mode: ViewMode, note: boolean): Layout {
	const timeline: readonly ColumnId[] = note ? [] : ["timeline"];
	if (note) return { columns: [mode === "rows" ? "rows" : "projects"], ribbon: false, divider: false };
	if (mode === "twoColumns") return { columns: ["inbox", "soon", "day", ...timeline], ribbon: true, divider: true };
	if (mode === "allColumns") return { columns: ["inbox", "soon", "day", ...timeline], ribbon: false, divider: true };
	return { columns: [mode === "rows" ? "rows" : "projects", ...timeline], ribbon: false, divider: true };
}

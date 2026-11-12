import type { DropColumn, ProjectsNodeId, ProjectsScreenState, ViewChoice, ViewMode, ViewModeOption } from "./contracts";
import type { EntryList, FunnelSpot } from "./screenPlaces";
import { SHOWN_LISTS } from "./screenPlaces";
import { PROJECTS_WORDS } from "./projectsScreen";

/** The words and icons of the view modes, the same in every frontend; the icon a Lucide name the Swift app maps to its symbol. */
export const VIEW_WORDS = {
	twoColumns: "Two columns",
	columns: "Columns",
	allColumns: "All columns",
	rows: "Rows",
	byProject: "By project",
} as const;

const ICONS: Readonly<Record<ViewMode, string>> = { twoColumns: "columns-2", allColumns: "columns-4", rows: "rows-3", byProject: "folder-tree" };

/** The funnel's lists the rows mode stacks, top to bottom: Inbox, Backlog, Soon, then the day column's list. */
export const ROW_LISTS: readonly DropColumn[] = ["inbox", "backlog", "soon", "day"];

/** What a view is read for: the main screen with its filter (null: none), or a project note's block fixed to its node. */
export interface ViewAsk {
	readonly node: ProjectsNodeId | null;
	/** The node is a done project or Done: only its closed tasks show, by project. */
	readonly closed: boolean;
	/** The host's screen is wide (the desktop): all columns are offered. */
	readonly wide: boolean;
	readonly note: boolean;
}

/**
 * The modes offered, in the menu's order: two columns (the phone's «Columns»), all columns where the screen is wide, rows,
 * and by project with a node chosen but No project; under Done or a done project by project alone. In a note no two or
 * all columns: the block shows its project's lists, not the funnel's walk.
 */
function offered(ask: ViewAsk): readonly ViewMode[] {
	if (ask.closed && ask.node !== null) return ["byProject"];
	const byProject: readonly ViewMode[] = ask.node !== null && ask.node !== "none" ? ["byProject"] : [];
	if (ask.note) return ["rows", ...byProject];
	return ["twoColumns", ...(ask.wide ? (["allColumns"] as const) : []), "rows", ...byProject];
}

/** The mode a view starts with: two columns without a filter, rows with one (in a note too); by project where it alone is offered. */
function defaultMode(ask: ViewAsk, modes: readonly ViewMode[]): ViewMode {
	const wanted: ViewMode = ask.node === null ? "twoColumns" : "rows";
	return modes.includes(wanted) ? wanted : modes[0];
}

/** The mode kept for this view: the note's, the filtered screen's or the plain screen's, each remembered apart. */
function keptMode(state: ProjectsScreenState, ask: ViewAsk): ViewMode | undefined {
	if (ask.note) return state.noteView;
	return ask.node === null ? state.view : state.filteredView;
}

/** The view's mode and the modes its button offers: the kept one while it is offered, else the default. */
export function viewChoice(state: ProjectsScreenState, ask: ViewAsk): ViewChoice {
	const modes = offered(ask);
	const kept = keptMode(state, ask);
	const mode = kept !== undefined && modes.includes(kept) ? kept : defaultMode(ask, modes);
	const label = (m: ViewMode) => (m === "twoColumns" && !ask.wide ? VIEW_WORDS.columns : VIEW_WORDS[m]);
	const options: ViewModeOption[] = modes.map((m) => ({ mode: m, label: label(m), icon: ICONS[m], checked: m === mode }));
	const plate = ask.node !== null || mode === "rows" ? PROJECTS_WORDS.noTasks : null;
	const plates = { inbox: plate, backlog: plate, soon: plate, day: plate };
	return { mode, modes: options, icon: ICONS[mode], wheel: mode === "twoColumns", rows: mode === "rows" ? ROW_LISTS : [], emptyLabel: PROJECTS_WORDS.noTasks, plates };
}

/** The view before any read: the device's kept mode, a node chosen (`state.selected`) counting as a filter that is no done one. */
export function firstViewOf(state: ProjectsScreenState, wide: boolean, note: boolean): ViewChoice {
	return viewChoice(state, { node: note ? "note" : (state.selected ?? null), closed: false, wide, note });
}

/** The state with `mode` kept for the view it was picked in. */
export function withMode(state: ProjectsScreenState, mode: ViewMode, filtered: boolean): ProjectsScreenState {
	return filtered ? { ...state, filteredView: mode } : { ...state, view: mode };
}

/**
 * The lists a field can stand in that the screen shows, in its order, in `mode` at `spot`: two columns the place's own
 * (`SHOWN_LISTS`; Done as Inbox), all columns and rows every funnel list, by project the Projects list.
 */
export function viewEntryLists(mode: ViewMode, spot: FunnelSpot): readonly EntryList[] {
	if (mode === "byProject") return ["projects"];
	if (mode === "twoColumns") return SHOWN_LISTS[spot === "done" ? "inbox" : spot];
	return ROW_LISTS;
}

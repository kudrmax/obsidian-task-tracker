import type { DropColumn, ProjectsNodeId, ProjectsScreenState, ViewChoice, ViewMode, ViewModeOption } from "./contracts";
import type { EntryList, FunnelSpot } from "./screenPlaces";
import { SHOWN_LISTS } from "./screenPlaces";
import { PROJECTS_WORDS } from "./projectsScreen";
import { viewLayout } from "./viewLayout";

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
	/** A funnel list's name as its column's title (`listName`); null for the day's, which draws its own. */
	readonly title: (list: DropColumn) => string | null;
}

/**
 * The modes offered, in the menu's order, the same under every filter and none (Max, 2026-11-12: mode and project are
 * independent): two columns (the phone's «Columns»), all columns where the screen is wide, rows, by project. In a note no
 * two or all columns: the block shows its project's lists, not the funnel's walk.
 */
function offered(ask: ViewAsk): readonly ViewMode[] {
	if (ask.note) return ["rows", "byProject"];
	return ["twoColumns", ...(ask.wide ? (["allColumns"] as const) : []), "rows", "byProject"];
}

/** The mode a view starts with, filter or none: two columns on the screen, rows in a note. */
function defaultMode(ask: ViewAsk): ViewMode {
	return ask.note ? "rows" : "twoColumns";
}

/** The mode kept for this view: the note's block its own, the screen one for every filter and none. */
function keptMode(state: ProjectsScreenState, ask: ViewAsk): ViewMode | undefined {
	return ask.note ? state.noteView : state.view;
}

/**
 * What a frontend tells one context from another by: the screen's filter and mode, or a note's block's mode. A read in
 * another context is drawn still, in place; the same context changed animates what moved.
 */
export function viewContext(node: ProjectsNodeId | null, mode: ViewMode, note: boolean): string {
	return JSON.stringify(note ? ["note", mode] : ["screen", node, mode]);
}

/**
 * The view's mode and the modes its button offers: the button shows the kept one while it is offered (All columns on a
 * narrow screen is not), else the default (`chosen`). What is drawn (`mode`) is the chosen one, except under Done and a
 * done project, whose own content is their done list by project in any mode chosen.
 */
export function viewChoice(state: ProjectsScreenState, ask: ViewAsk): ViewChoice {
	const modes = offered(ask);
	const kept = keptMode(state, ask);
	const chosen = kept !== undefined && modes.includes(kept) ? kept : defaultMode(ask);
	const mode: ViewMode = ask.closed && ask.node !== null ? "byProject" : chosen;
	const label = (m: ViewMode) => (m === "twoColumns" && !ask.wide ? VIEW_WORDS.columns : VIEW_WORDS[m]);
	const options: ViewModeOption[] = modes.map((m) => ({ mode: m, label: label(m), icon: ICONS[m], checked: m === chosen }));
	const plate = ask.node !== null || mode === "rows" ? PROJECTS_WORDS.noTasks : null;
	const plates = { inbox: plate, backlog: plate, soon: plate, day: plate };
	const ribbon = mode === "twoColumns" && !ask.note;
	return {
		mode,
		chosen,
		modes: options,
		icon: ICONS[chosen],
		wheel: mode === "twoColumns",
		ribbon,
		source: mode === "byProject" ? "projectsScreen" : "screen",
		rows: mode === "rows" ? ROW_LISTS : [],
		emptyLabel: PROJECTS_WORDS.noTasks,
		plates,
		layout: viewLayout(mode, ask.note, ask.title),
		context: viewContext(ask.node, mode, ask.note),
	};
}

/** The view before any read: the device's kept mode, a node chosen (`state.selected`) counting as a filter (All as none, Done as closed). */
export function firstViewOf(state: ProjectsScreenState, wide: boolean, note: boolean, title: ViewAsk["title"]): ViewChoice {
	const node = note ? "note" : state.selected === undefined || state.selected === "all" ? null : state.selected;
	return viewChoice(state, { node, closed: node === "done", wide, note, title });
}

/** The state with `mode` the screen's one mode; a mode an older version kept for a filter apart (`filteredView`) goes. */
export function withMode(state: ProjectsScreenState, mode: ViewMode): ProjectsScreenState {
	const { filteredView: _old, ...rest } = state as ProjectsScreenState & { readonly filteredView?: ViewMode };
	return { ...rest, view: mode };
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

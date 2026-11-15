import { type ColumnSections, dayTitle, type ListSection, type DropColumn, type FunnelView, type ProjectsView, type ScreenSettings, type ScreenView, type TaskItem, type ViewChoice } from "../../../../core/application/contracts";
import type { LocalDate } from "./answers";
import { type Answers, type Need, NO_ANSWERS, resultOf } from "./answers";
import { funnelList, type ListModel, projectsList } from "./lists";
import type { Layer } from "./layers";
import type { EntryModel } from "./entry";
import type { CarryModel } from "./carry";
import type { SelectModel } from "./select";
import { type Found, type SearchModel, searchNeeds } from "./search";
import { fullLayer, fullNeeds } from "./full";

/**
 * A note's block (D3): the view fixed to the note's project, at the end of the note. Every fact is a field here or a
 * selector over one (P1): what the core answered (`answers`, the views the block needs), the layers over it, the field
 * typed, the card carried. Nothing is read back from the DOM.
 */
export interface BlockModel {
	/** The note's path: its project's view is what the block shows (`tasks.projectNoteView`). */
	readonly note: string;
	/** The desktop: the core lays the view out for a wide screen. */
	readonly wide: boolean;
	readonly answers: Answers;
	/** The layers over the block, bottom first (P6): a menu, the full card, a sheet. */
	readonly layers: readonly Layer[];
	/** The task being typed (quick entry, a rename, a subtask): its field among the cards. */
	readonly entry: EntryModel | null;
	/** A card (or the plus) carried inside the block. */
	readonly carry: CarryModel | null;
	/** Select mode: the cards picked. */
	readonly select: SelectModel | null;
	/** The search over the block. */
	readonly search: SearchModel | null;
	/** The task the search led to: its card wears the ring until the next press. */
	readonly found: Found | null;
	/**
	 * The lists as they stood when something began to move (a carry, a closing sheet): drawn while it moves, so nothing
	 * under the finger or the sheet is redrawn (P6). Null when nothing pins them.
	 */
	readonly pinned: BlockLists | null;
	/** Bumped by every change of what the lists show that moves rows within one context (P5): the motion driver's cue. */
	readonly motion: Motion;
}

/**
 * Why the lists drawn next differ from the last ones (P5): `move` the same context changed (rows slide, grow in, fold
 * away); `replace` another context (mode, project, the first read): drawn in place, nothing moves.
 */
export interface Motion {
	readonly seq: number;
	readonly cause: "move" | "replace";
	readonly context: string | null;
}

export function blockModel(note: string, wide: boolean): BlockModel {
	return { note, wide, answers: NO_ANSWERS, layers: [], entry: null, carry: null, select: null, search: null, found: null, pinned: null, motion: { seq: 0, cause: "replace", context: null } };
}

// Needs ------------------------------------------------------------------------------------------------------------

/** The rows' lists the block reads, and the column each is drawn from. */
const ROW_KEY = (column: DropColumn) => `sections:${column}`;

/** The view answers the block draws (P2 step 3): its note's view first; the lists, sections and the rest once it has it. */
export function blockNeeds(model: BlockModel): readonly Need[] {
	const needs: Need[] = [
		{ key: "note", method: "tasks.projectNoteView", args: [model.note, model.wide] },
		{ key: "today", method: "days.today", args: [] },
		{ key: "canUndo", method: "history.canUndo", args: [] },
		{ key: "settings", method: "screenSettings.get", args: [] },
	];
	const funnel = noteView(model);
	const today = resultOf<LocalDate>(model.answers, "today");
	if (funnel && today) {
		const node = funnel.filter?.node ?? null;
		if (funnel.view.source === "projectsScreen" && node !== null) needs.push({ key: "projects", method: "tasks.projectsScreen", args: [node] });
		else {
			needs.push({ key: "screen", method: "tasks.screen", args: [today, node] });
			for (const column of rowColumns(funnel.view)) needs.push({ key: ROW_KEY(column), method: "tasks.columnSections", args: [column, today] });
		}
	}
	needs.push(...fullNeeds(fullLayer(model.layers), model.answers), ...searchNeeds(model.search));
	return needs;
}

// Selectors --------------------------------------------------------------------------------------------------------

/** The note's project's view; null when the note is no project's (the host then takes the block away), undefined before the first read. */
export function noteView(model: BlockModel): FunnelView | null {
	return resultOf<FunnelView | null>(model.answers, "note");
}

export function today(model: BlockModel): LocalDate | null {
	return resultOf<LocalDate>(model.answers, "today");
}

export function settings(model: BlockModel): ScreenSettings | null {
	return resultOf<ScreenSettings>(model.answers, "settings");
}

export function canUndo(model: BlockModel): boolean {
	return resultOf<boolean>(model.answers, "canUndo") === true;
}

export function screenView(model: BlockModel): ScreenView | null {
	return resultOf<ScreenView>(model.answers, "screen");
}

export function projectsView(model: BlockModel): ProjectsView | null {
	return resultOf<ProjectsView>(model.answers, "projects");
}

/** The rows' lists, top to bottom (`layout.stack`). */
function rowColumns(view: ViewChoice): readonly DropColumn[] {
	return view.layout.stack?.lists ?? view.rows;
}

/** A row of the Rows mode: its label over its list. */
export interface BlockRow {
	readonly column: DropColumn;
	readonly label: string;
	readonly list: ListModel;
}

/** What the block's lists show, in its mode: Rows (the funnel's lists stacked) or By subprojects (the project's parts). */
export type BlockLists =
	| { readonly kind: "rows"; readonly context: string; readonly rows: readonly BlockRow[] }
	| { readonly kind: "byProject"; readonly context: string; readonly list: ListModel }
	| { readonly kind: "none" };

const NO_LISTS: BlockLists = { kind: "none" };

function itemsOf(screen: ScreenView, column: DropColumn): readonly TaskItem[] {
	switch (column) {
		case "day":
			return screen.day.list;
		case "inbox":
			return screen.inbox;
		case "soon":
			return screen.soon;
		case "backlog":
			return screen.backlog;
	}
}

/** The sections of a grouped list, as the screen's read gives them. */
function sectionsOfList(screen: ScreenView, list: ColumnSections["list"]): readonly ListSection[] {
	return new Map(Object.entries(screen.sections)).get(list) ?? [];
}

/** The lists as the core's answers stand now. */
export function currentLists(model: BlockModel): BlockLists {
	const funnel = noteView(model);
	const day = today(model);
	const shown = settings(model);
	if (!funnel || !day || !shown) return NO_LISTS;
	const view = funnel.view;
	if (view.source === "projectsScreen") {
		const projects = projectsView(model);
		return projects ? { kind: "byProject", context: view.context, list: projectsList(projects) } : NO_LISTS;
	}
	const screen = screenView(model);
	if (!screen) return NO_LISTS;
	const titles = new Map(view.layout.columns.flatMap((column) => column.lists).map((list) => [list.list, list.title]));
	const rows = rowColumns(view).map((column): BlockRow => {
		const sections = resultOf<ColumnSections | null>(model.answers, ROW_KEY(column));
		return {
			column,
			label: titles.get(column) ?? dayTitle(day, "today", day),
			list: funnelList({
				items: itemsOf(screen, column),
				day: column === "day" ? day : null,
				grouped: sections !== null,
				sections: sections ? sectionsOfList(screen, sections.list) : [],
				ungrouped: shown.ungrouped,
				plate: new Map(Object.entries(view.plates)).get(column) ?? null,
				emptyLabel: view.emptyLabel,
			}),
		};
	});
	return { kind: "rows", context: view.context, rows };
}

/** The lists the view draws: as they stood when something began to move while it moves (P6), else as they stand. */
export function shownLists(model: BlockModel): BlockLists {
	return model.pinned ?? currentLists(model);
}

/** The view button's choice: its icon and its menu (`ViewChoice`). */
export function viewChoice(model: BlockModel): ViewChoice | null {
	return noteView(model)?.view ?? null;
}

/** The task a menu or the full card names, found among what the block shows now by its id (P6 pins hold ids). */
export function taskById(model: BlockModel, id: string): TaskItem | null {
	const lists = currentLists(model);
	const rows = lists.kind === "rows" ? lists.rows.flatMap((row) => row.list.rows) : lists.kind === "byProject" ? lists.list.rows : [];
	for (const row of rows) if (row.kind === "card" && row.item.id === id) return row.item;
	return null;
}

/** The variables each keyed row carries to the stylesheet (`motion` writes them): a card's level, a branch line's offset. */
export function rowVars(lists: BlockLists): ReadonlyMap<string, Readonly<Record<string, string>>> {
	const vars = new Map<string, Readonly<Record<string, string>>>();
	const rows = lists.kind === "rows" ? lists.rows.flatMap((row) => row.list.rows) : lists.kind === "byProject" ? lists.list.rows : [];
	for (const row of rows) {
		if (row.kind !== "card") continue;
		if (row.level > 0) vars.set(row.key, { "--tc-n-level": String(row.level) });
		for (const pass of row.branch?.passes ?? []) vars.set(`${row.key}/pass/${pass}`, { "--tc-n-pass": String(pass) });
	}
	return vars;
}

/** The root's own classes: a card of several labels blends them (`labelPaint`) on the block and over it alike. */
export function rootClasses(model: BlockModel, part: string): string {
	return settings(model)?.labelPaint === "blend" ? `task-calendar ${part} is-blend` : `task-calendar ${part}`;
}

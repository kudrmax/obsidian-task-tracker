import { type EntryList, type EntryPart, type EntryInList, type EntryState, type GroupName, type Header, labelTitle, type ListCard, type Placement, type TaskItem, viewEntryLists } from "../../../../core/application/contracts";

/** What follows an `entry.*` answer: the field opened at the spot it answered (renaming a task, typing its subtask, naming a section), another call, or an Enter's own. */
export type EntryThen = { readonly open: "rename" | "subtask" | "newSection"; readonly item: TaskItem } | { readonly after: string } | { readonly enter: true } | null;
import { type BlockLists, type BlockModel, currentLists, noteView, sectioned, shownLists, today } from "./block";
import { type ListModel, type ListRow, withBranches } from "./lists";
import { type TitlePart, titleParts } from "./card";
import { type Answers, type LocalDate, type Need, resultOf } from "./answers";

/**
 * The quick entry of the block (quick-add spec §4.2–4.9): every rule is the core's (`QuickEntry` behind the door's
 * `entry.*`, its job order `entryJobStep`); the model keeps what the core answers between calls, as the iPhone app does.
 */
export interface EntryModel {
	/** The core's `EntrySession`, as it last answered it: handed back with every call. Plain data, opaque here. */
	readonly session: unknown;
	/** The field as the core says it stands now; null once it closed. */
	readonly state: EntryState | null;
	/** The renames entered and not yet written: each card shows its new text meanwhile. */
	readonly renamed: EntryState["renamed"];
	/** The core's `EntryJobs` (the jobs queued and the one under way), opaque here; the job order runs them one at a time. */
	readonly jobs: unknown;
	/** Jobs the last answer queued, not yet handed to the job order. */
	readonly queued: readonly unknown[];
	/** A job step is due: the outcome of the last one (null at a job's start). */
	readonly due: { readonly outcome: JobOutcome } | null;
	/** The field's row key: the field after an Enter that wrote a line is a row of its own. */
	readonly field: string;
	readonly fields: number;
	/** The rows of lines entered whose tasks are not written yet, oldest first: each written task's card takes the next. */
	readonly heirs: readonly string[];
	/**
	 * The row each written task's card took the place of (P1, R4), by the id its write answered: the card stands where the
	 * field stood, nothing flying in; the next field comes in under it.
	 */
	readonly bound: ReadonlyMap<string, string>;
	/** Bumped by every typing pick: the field takes the focus once, inside the tap that opened it. */
	readonly focus: number;
	/** The bar's panel open: the levels and labels (`priority`), the places (`place`); null for none. */
	readonly panel: string | null;
}

/** What a job step came to (`EntryJobOutcome`): a door call's result, a failure, or nothing. */
export type JobOutcome = { readonly ok: true; readonly result: unknown } | { readonly ok: false } | null;

export const NO_ENTRY_JOBS: unknown = { queue: [], running: null };

export function entryModel(): EntryModel {
	return { session: null, state: null, renamed: [], jobs: NO_ENTRY_JOBS, queued: [], due: null, field: "entry:0", fields: 0, heirs: [], bound: new Map(), focus: 0, panel: null };
}

/**
 * The quick entry's messages. The ones other parts send: a typing pick from a task's menu (`rename`, `subtask`), a
 * new section named from the section page (`newSection`), the plus and the plates (`plus`, `inSection`), a double
 * click on a list's free room (`atEnd`). The rest are the field's own and the door's answers.
 */
export type EntryMsg =
	| { readonly kind: "rename"; readonly id: string }
	| { readonly kind: "subtask"; readonly id: string }
	/** The section page's «New section…»: the field types a section's name where the task of `id` stands (its card's place), as the old menu's naming did. */
	| { readonly kind: "newSection"; readonly id: string }
	| { readonly kind: "plus" }
	/** New section, from a task's Section page: the task waits at the end of its list under a field for the new section's name. */
	| { readonly kind: "inSection"; readonly row: string; readonly group: GroupName; readonly list: boolean }
	| { readonly kind: "atEnd"; readonly column: EntryList }
	/** The plus let go on a place of a funnel's list (`drop`, what `tasks.drop` would take there): the field opens at it. */
	| { readonly kind: "atDrop"; readonly column: EntryList; readonly drop: unknown }
	/** The plus let go on a place of By subprojects' parts: the field opens at it. */
	| { readonly kind: "atPlace"; readonly column: EntryList; readonly place: unknown }
	| { readonly kind: "typed"; readonly text: string }
	| { readonly kind: "key"; readonly key: "enter" | "escape" | "tab" | "shiftTab" | "altTab" }
	/** The field lost the focus and did not get it back (the keyboard put away, a tap elsewhere). */
	| { readonly kind: "blurred" }
	/** The bar's buttons and its panels' tiles. */
	| { readonly kind: "bar"; readonly act: string; readonly value: string | null }
	/** A door answer of an `entry.*` call (`EntryAnswer`), and what follows it. */
	| { readonly kind: "answered"; readonly answer: unknown; readonly job: boolean; readonly then: EntryThen }
	/** A job step's outcome: the door method it called, its result, or its error. */
	| { readonly kind: "stepped"; readonly outcome: JobOutcome; readonly method: string; readonly error: { readonly code: string; readonly message: string } | null }
	/** The job order took the queued jobs and its next step: what it now stands at. */
	| { readonly kind: "jobs"; readonly jobs: unknown };

// The look --------------------------------------------------------------------------------------------------------

/** What the core's entry reads of the screen (`WireLook`): each list's cards and sections, the day, the lists shown, the parts, the filter. */
export interface EntryLook {
	readonly cards: Readonly<Record<string, readonly ListCard[]>>;
	readonly sections: Readonly<Record<string, readonly Header[]>>;
	readonly sectioned: Readonly<Record<string, boolean>>;
	readonly day: LocalDate;
	readonly shown: readonly EntryList[];
	readonly parts: Readonly<Record<string, readonly EntryPart[]>>;
	readonly filter: { readonly node: string; readonly project: string | null } | null;
}

/** The lists of the block by the entry's names for them: the rows' columns, or the Projects list By subprojects. */
export function entryLists(lists: BlockLists): ReadonlyMap<EntryList, ListModel> {
	if (lists.kind === "rows") return new Map(lists.rows.map((row) => [row.column, row.list] as const));
	if (lists.kind === "byProject") return new Map([["projects", lists.list] as const]);
	return new Map();
}

/** The look of the block as it stands in `lists` (what the lists draw, or are about to). Null before the block has its view. */
export function entryLook(model: BlockModel, lists: BlockLists, sectioned: (column: EntryList) => boolean): EntryLook | null {
	const funnel = noteView(model);
	const day = today(model);
	if (!funnel || !day) return null;
	const shown = entryLists(lists);
	const by = <T>(read: (list: ListModel, column: EntryList) => T) => Object.fromEntries([...shown].map(([column, list]) => [column, read(list, column)] as const));
	const filter = funnel.filter;
	return {
		cards: by((list) => list.cards),
		sections: by((list) => list.sections),
		sectioned: by((_list, column) => sectioned(column)),
		day,
		shown: viewEntryLists(funnel.view.mode, funnel.place),
		parts: by((list) => list.parts),
		filter: filter ? { node: filter.node, project: filter.project } : null,
	};
}

/** The text a card shows while a rename of its task waits to be written. */
export function renamedText(entry: EntryModel | null, item: TaskItem): string | null {
	return entry?.renamed.find((rename) => rename.id === item.id)?.text ?? null;
}

// Where the field stands ---------------------------------------------------------------------------------------------

const LIST_NEED = "entry:list";

/**
 * The view answer the block needs while a field is open (P2): where among what its list draws the field stands
 * (`entry.listEntry` over the session and the look), so the core alone says it.
 */
export function entryNeeds(model: BlockModel): readonly Need[] {
	const entry = model.entry;
	if (!entry?.state) return [];
	const lists = currentLists(model);
	const look = entryLook(model, lists, (c) => sectioned(model, c));
	if (!look) return [];
	const place = entry.state.place;
	return [
		...[...entryLists(lists).keys()].map((column) => ({ key: `${LIST_NEED}:${column}`, method: "entry.listEntry", args: [entry.session, look, column] })),
		...(place ? [{ key: PLACE_TITLE, method: "tasks.placementTitle", args: [place] }] : []),
		...PLACE_LISTS.map((list) => ({ key: `${LIST_NAME}:${list}`, method: "tasks.listName", args: [list] })),
	];
}

const PLACE_TITLE = "entry:placeTitle";
const LIST_NAME = "entry:listName";
const PLACE_LISTS = ["inbox", "backlog", "soon", "now"] as const;

/** The place button's words: a list's name, a day as `5 Nov` (`tasks.placementTitle`). */
export function placeTitle(model: BlockModel): string {
	return resultOf<string>(model.answers, PLACE_TITLE) ?? "";
}

/** A list's name as the tasks file heads it (`tasks.listName`). */
export function listName(model: BlockModel, list: string): string {
	return resultOf<string>(model.answers, `${LIST_NAME}:${list}`) ?? "";
}

/** Where the field stands in the list of `column` (`ListEntry`), as the core answered it; null when it stands elsewhere. */
function listEntry(answers: Answers, column: EntryList): EntryInList | null {
	return resultOf<{ readonly value: EntryInList | null }>(answers, `${LIST_NEED}:${column}`)?.value ?? null;
}

/**
 * The rows of a list's section, `section` its index among the sections drawn: from its first row (its header, its plate
 * or its first card) to past its last card's subtasks.
 */
function sectionSpan(list: ListModel, section: number): { readonly from: number; readonly to: number } | null {
	let from = -1;
	let to = -1;
	list.rows.forEach((row, i) => {
		const inSection = (row.kind === "head" || row.kind === "card" || row.kind === "plate") && row.part === section;
		if (inSection && from < 0) from = i;
		if (inSection) to = i + 1;
	});
	return from < 0 ? null : { from, to };
}

/** The index among `list.rows` the field stands before, by where the core says it stands (`EntryAt`). */
function fieldIndex(list: ListModel, at: EntryInList["at"]): number {
	const rows = list.rows;
	switch (at.kind) {
		case "top": {
			const head = rows.findIndex((row) => row.kind === "head");
			return head < 0 ? 0 : head;
		}
		case "end":
			return rows.length;
		case "in": {
			const card = list.cards.slice(at.card, at.card + 1).find(() => true);
			if (card) {
				const index = rows.findIndex((row) => row.kind === "card" && row.item.id === card.id);
				if (index >= 0) return index;
			}
			return sectionSpan(list, at.section)?.to ?? rows.length;
		}
	}
}

/**
 * A list with the entry among its rows (`EntryRows` of the old screen): the lines typed and not yet written, each a plain
 * card at its level, then the field, where the core says; the card being renamed out of the rows (its field stands in its
 * place); a plate the field takes the place of gone. Every card shows a rename waiting to be written.
 */
export function withEntry(list: ListModel, column: EntryList, model: BlockModel): ListModel {
	const entry = model.entry;
	const state = entry?.state ?? null;
	const renaming = state?.renaming?.id ?? null;
	const renamed = (row: ListRow): ListRow => {
		if (row.kind !== "card" || !entry) return row;
		const text = renamedText(entry, row.item);
		return text === null ? row : { ...row, face: { ...row.face, title: titleOf(text) } };
	};
	let rows = list.rows.filter((row) => !(row.kind === "card" && row.item.id === renaming)).map(renamed);
	const placed = state ? listEntry(model.answers, column) : null;
	if (state && entry && placed) {
		const shown: ListModel = { ...list, rows };
		let at = fieldIndex(shown, placed.at);
		const plate = placed.at.kind === "in" && !placed.at.keepsPlate ? sectionSpan(shown, placed.at.section) : null;
		if (plate) {
			const before = rows.slice(0, at);
			const kept = before.filter((row, i) => !(row.kind === "plate" && i >= plate.from));
			at -= before.length - kept.length;
			rows = [...kept, ...rows.slice(before.length)];
		}
		rows = rows.filter((row) => !(row.kind === "plate" && row.list));
		at = Math.min(at, rows.length);
		const typed: ListRow[] = placed.pending.map((line, i) => ({ kind: "unwritten", key: `${entry.field}:line:${i}`, level: line.level, text: line.text, branch: null }));
		const field: ListRow = {
			kind: "field",
			key: entry.field,
			level: placed.place.level,
			section: placed.section,
			tint: state.marks.tint,
			status: state.renaming?.status ?? null,
			branch: null,
		};
		rows = [...rows.slice(0, at), ...typed, field, ...rows.slice(at)];
	}
	return { ...list, rows: withBranches(rows) };
}

/** A title's parts for a rename's text: drawn as any card's title. */
function titleOf(text: string): readonly TitlePart[] {
	return titleParts(text);
}

/** The lists as the view draws them: as shown, each with the entry among its rows. */
export function drawnLists(model: BlockModel): BlockLists {
	const lists = shownLists(model);
	if (!model.entry) return lists;
	if (lists.kind === "rows") return { ...lists, rows: lists.rows.map((row) => ({ ...row, list: withEntry(row.list, row.column, model) })) };
	if (lists.kind === "byProject") return { ...lists, list: withEntry(lists.list, "projects", model) };
	return lists;
}

// The bar --------------------------------------------------------------------------------------------------------------

/** A tile of the bar's panel: what it shows, whether it stands for what is set, and the bar's act a tap on it is. */
export interface BarTile {
	readonly label: string;
	readonly icon: "priority" | "label" | "inbox" | "backlog" | "soon" | "now" | "calendar";
	readonly color: string | null;
	readonly on: boolean;
	readonly disabled: boolean;
	readonly act: "priority" | "label" | "place" | "date";
	readonly value: string;
}

const TILES_PER_ROW = 3;

/** Tiles in rows of at most three, as even as they go: four make two and two, five three and two (the menus' rule). */
function tileRows(tiles: readonly BarTile[]): readonly (readonly BarTile[])[] {
	if (tiles.length === 0) return [];
	const perRow = Math.ceil(tiles.length / Math.ceil(tiles.length / TILES_PER_ROW));
	const rows: BarTile[][] = [];
	for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
	return rows;
}

/** The icon of a place: its list's, or the calendar for a date. */
export function placeIcon(placement: Placement): "inbox" | "backlog" | "soon" | "now" | "calendar" {
	return placement.kind === "date" ? "calendar" : placement.kind;
}

/**
 * The open panel's tiles, group by group: the levels (a pick), then the labels (each a toggle, the panel staying), as the
 * core's marks say which is on and which may be chosen; or the places, a list's name by its section's name, then Date.
 */
export function barTiles(state: EntryState, panel: string | null, listName: (list: string) => string): readonly (readonly (readonly BarTile[])[])[] {
	if (panel === "priority") {
		const levels = state.marks.tiles.levels.map(({ mark, on, enabled }): BarTile => ({ label: mark.prefix, icon: "priority", color: mark.color, on, disabled: !enabled, act: "priority", value: mark.prefix }));
		const labels = state.marks.tiles.labels.map(({ mark, on, enabled }): BarTile => ({ label: labelTitle(mark.name), icon: "label", color: mark.color, on, disabled: !enabled, act: "label", value: mark.name }));
		return [tileRows(levels), tileRows(labels)].filter((group) => group.length > 0);
	}
	if (panel === "place") {
		const tiles = state.places.map((choice): BarTile =>
			choice.kind === "date"
				? { label: "Date", icon: "calendar", color: null, on: choice.on, disabled: false, act: "date", value: choice.date ?? "" }
				: { label: listName(choice.kind), icon: choice.kind, color: null, on: choice.on, disabled: false, act: "place", value: JSON.stringify({ kind: choice.kind }) },
		);
		return [[tiles]];
	}
	return [];
}

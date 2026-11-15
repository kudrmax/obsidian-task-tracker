import { branchOf, type DropColumn, type EntryPart, type GroupName, type Header, type ListCard, type ListGroup, type ListSection, listView, type MenuFrom, projectsEntryLook, type ProjectsDrop, type ProjectsView, type TaskItem } from "../../../../core/application/contracts";
import type { LocalDate } from "./answers";
import { type CardFace, cardFace } from "./card";

/** A branch from a subtask's task to it, bending in when it is the last; and the lines of the tasks further up going on past it. */
export interface Branch {
	readonly last: boolean;
	/** Each line going on past the row, counted from its own level up (`--tc-n-pass`). */
	readonly passes: readonly number[];
}

/** Where a card stands in its list, as the core names a place: the list's section and its level. */
export interface CardRow {
	readonly kind: "card";
	/** The index of its section among those the list draws (`ListModel.sections`): where the field stands by the core's `EntryAt`. */
	readonly part: number;
	/** The row's key: the task's id (`TaskItem.id`), who it is for its whole life (P1). */
	readonly key: string;
	readonly item: TaskItem;
	readonly level: number;
	readonly group: GroupName;
	readonly branch: Branch | null;
	readonly face: CardFace;
	/** The task whose card and menu this row stands for in a list of parts (By subprojects: its part's card); its own id elsewhere. */
	readonly owner: string;
	/** The column its menu and a pick read it as standing in (`MenuFrom`: a funnel's list, By subprojects' card's own). */
	readonly from: MenuFrom;
	/** By subprojects: what the core takes for this row in a carry (`ProjectsListRow.drop`); null in a funnel's list. */
	readonly drop: ProjectsDrop | null;
}

/** A section's header. */
export interface HeadRow {
	readonly kind: "head";
	/** The index of its section among those the list draws (`ListModel.sections`): where the field stands by the core's `EntryAt`. */
	readonly part: number;
	readonly key: string;
	readonly name: string;
	/** The tasks outside any section: the header is muted and opens nothing. */
	readonly ungrouped: boolean;
	readonly group: GroupName;
	/** It opens its part for a drop (`ProjectsSection.opens`); a funnel's section header never does. */
	readonly opens: boolean;
	/** What its menu offers (`ListGroup.menu`): the section it names, renamed or removed; null: no menu (No section, By subprojects' parts). */
	readonly menu: { readonly section: string; readonly rename: boolean; readonly remove: boolean } | null;
	/** A long press lifts it among the list's sections (`ListGroup.reorder`); never By subprojects. */
	readonly reorder: boolean;
	/** The tasks under it, as its lifted copy counts them. */
	readonly count: number;
}

/** The No tasks plate under an empty section, or of a list that draws nothing (`list`): a tap types a task there. */
export interface PlateRow {
	readonly kind: "plate";
	/** The index of its section among those the list draws (`ListModel.sections`): where the field stands by the core's `EntryAt`. */
	readonly part: number;
	readonly key: string;
	readonly words: string;
	readonly group: GroupName;
	/** The plate of the whole list (types at the list's end), not a section's. */
	readonly list: boolean;
}

/**
 * The field a task is typed in (the quick entry), at its level among the cards: a section's name stands as a header
 * does. `tint`: the colour of the priority or the first label it is written with; `status` of the task it renames.
 */
export interface FieldRow {
	readonly kind: "field";
	readonly key: string;
	readonly level: number;
	readonly section: boolean;
	readonly tint: string | null;
	readonly status: TaskItem["status"] | null;
	readonly branch: Branch | null;
}

/** A line entered and not yet written: a plain card with its text alone, at the level it was entered at. */
export interface UnwrittenRow {
	readonly kind: "unwritten";
	readonly key: string;
	readonly level: number;
	readonly text: string;
	readonly branch: Branch | null;
}

export type ListRow = CardRow | HeadRow | PlateRow | FieldRow | UnwrittenRow;

type LevelRow = CardRow | FieldRow | UnwrittenRow;

const levelled = (row: ListRow): row is LevelRow => row.kind === "card" || row.kind === "field" || row.kind === "unwritten";

/** A list as the view draws it: its rows in order, each keyed (P1); and as the quick entry reads it (`EntryLook`). */
export interface ListModel {
	readonly rows: readonly ListRow[];
	/** Its cards as places in it see them, each in the section it is drawn in. */
	readonly cards: readonly ListCard[];
	/** The sections it draws, in order (null: the part without a section). */
	readonly sections: readonly Header[];
	/** Its parts' own writes, where the list decides what a new task typed in it writes (By subprojects); none for a funnel's list. */
	readonly parts: readonly EntryPart[];
}

const passesOf = (through: readonly boolean[]): number[] => through.flatMap((goesOn, i) => (goesOn ? [through.length - i] : []));

/** Each row at a level gets its branch from the rows around it, the field and the lines typed among them. */
export function withBranches(rows: readonly ListRow[]): ListRow[] {
	const cards = rows.filter(levelled);
	const levels = cards.map((card) => card.level);
	const branched = new Map(
		cards.map((card, i) => {
			const lines = branchOf(levels, i);
			return [card.key, lines ? { last: lines.last, passes: passesOf(lines.through) } : null] as const;
		}),
	);
	return rows.map((row) => (levelled(row) ? { ...row, branch: branched.get(row.key) ?? null } : row));
}

export interface FunnelListInput {
	/** The list's column: where its cards' menus open from. */
	readonly column: DropColumn;
	readonly items: readonly TaskItem[];
	/** The day its cards leave out of their corner; null for a list of no day. */
	readonly day: LocalDate | null;
	/** The list shows its sections (`columnSections` answered one). */
	readonly grouped: boolean;
	readonly sections: readonly ListSection[];
	readonly ungrouped: string;
	/** The words of the plate a list that draws nothing shows (`ViewChoice.plates`); null for none. */
	readonly plate: string | null;
	readonly emptyLabel: string;
}

/** A funnel's list in its sections, as the old screen's `TaskList` draws it. */
export function funnelList(input: FunnelListInput): ListModel {
	const view = listView(input.items, input.grouped, input.sections);
	const rows: ListRow[] = [];
	(view.groups as readonly ListGroup[]).forEach((group, part) => {
		if (view.showsHeaders && group.header) rows.push({ kind: "head", key: `head:${group.id}`, part, name: group.name ?? input.ungrouped, ungrouped: group.name === null, group: group.name, opens: false, menu: group.menu, reorder: group.reorder, count: group.items.length });
		if (group.empty) rows.push({ kind: "plate", key: `plate:${group.id}`, part, words: input.emptyLabel, group: group.name, list: false });
		for (const { item, level } of group.rows) rows.push({ kind: "card", key: item.id, part, item, level, group: group.name, branch: null, face: cardFace(item, input.day), owner: item.id, from: input.column, drop: null });
	});
	if (rows.length === 0 && input.plate !== null) rows.push({ kind: "plate", key: "empty", part: -1, words: input.plate, group: null, list: true });
	const cards = (view.groups as readonly ListGroup[]).flatMap((group) => group.rows.map(({ item, level }): ListCard => ({ key: item.key, id: item.id, level, group: group.name })));
	return { rows: withBranches(rows), cards, sections: (view.groups as readonly ListGroup[]).map((group) => group.name), parts: [] };
}

/** The node's tasks in their parts (By subprojects), as the old screen's `ProjectTasks` draws them. */
export function projectsList(view: ProjectsView): ListModel {
	const rows: ListRow[] = [];
	if (view.sections.length === 0) rows.push({ kind: "plate", key: "plate:none", part: -1, words: view.emptyLabel, group: null, list: true });
	view.sections.forEach((section, part) => {
		if (section.header && section.title !== null) rows.push({ kind: "head", key: `head:${section.key}`, part, name: section.title, ungrouped: false, group: section.group, opens: section.opens, menu: null, reorder: false, count: section.rows.length });
		if (section.plate) rows.push({ kind: "plate", key: `plate:${section.key}`, part, words: view.emptyLabel, group: section.group, list: false });
		let owner = "";
		let from: MenuFrom = "done";
		for (const row of section.rows) {
			if (row.card) {
				owner = row.id;
				from = row.card.menuFrom;
			}
			if (owner === "") continue;
			rows.push({ kind: "card", key: row.id, part, item: row.item, level: row.level, group: section.group, branch: null, face: cardFace(row.item, null, row.card?.stage ?? null), owner, from, drop: row.drop });
		}
	});
	const look = projectsEntryLook(view);
	return { rows: withBranches(rows), cards: look.cards, sections: look.sections, parts: look.parts };
}

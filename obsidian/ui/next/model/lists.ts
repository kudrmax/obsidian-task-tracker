import { branchOf, type GroupName, type ListGroup, type ListSection, listView, type ProjectsView, type TaskItem } from "../../../../core/application/contracts";
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
	/** The row's key: the task's id (`TaskItem.id`), who it is for its whole life (P1). */
	readonly key: string;
	readonly item: TaskItem;
	readonly level: number;
	readonly group: GroupName;
	readonly branch: Branch | null;
	readonly face: CardFace;
	/** The task whose card and menu this row stands for in a list of parts (By subprojects: its part's card); its own id elsewhere. */
	readonly owner: string;
}

/** A section's header. */
export interface HeadRow {
	readonly kind: "head";
	readonly key: string;
	readonly name: string;
	/** The tasks outside any section: the header is muted and opens nothing. */
	readonly ungrouped: boolean;
	readonly group: GroupName;
}

/** The No tasks plate under an empty section, or of a list that draws nothing (`list`): a tap types a task there. */
export interface PlateRow {
	readonly kind: "plate";
	readonly key: string;
	readonly words: string;
	readonly group: GroupName;
	/** The plate of the whole list (types at the list's end), not a section's. */
	readonly list: boolean;
}

export type ListRow = CardRow | HeadRow | PlateRow;

/** A list as the view draws it: its rows in order, each keyed (P1). */
export interface ListModel {
	readonly rows: readonly ListRow[];
}

const passesOf = (through: readonly boolean[]): number[] => through.flatMap((goesOn, i) => (goesOn ? [through.length - i] : []));

function withBranches(rows: ListRow[]): ListRow[] {
	const cards = rows.filter((row): row is CardRow => row.kind === "card");
	const levels = cards.map((card) => card.level);
	const branched = new Map(
		cards.map((card, i) => {
			const lines = branchOf(levels, i);
			return [card.key, lines ? { last: lines.last, passes: passesOf(lines.through) } : null] as const;
		}),
	);
	return rows.map((row) => (row.kind === "card" ? { ...row, branch: branched.get(row.key) ?? null } : row));
}

export interface FunnelListInput {
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
	for (const group of view.groups as readonly ListGroup[]) {
		if (view.showsHeaders && group.header) rows.push({ kind: "head", key: `head:${group.id}`, name: group.name ?? input.ungrouped, ungrouped: group.name === null, group: group.name });
		if (group.empty) rows.push({ kind: "plate", key: `plate:${group.id}`, words: input.emptyLabel, group: group.name, list: false });
		for (const { item, level } of group.rows) rows.push({ kind: "card", key: item.id, item, level, group: group.name, branch: null, face: cardFace(item, input.day), owner: item.id });
	}
	if (rows.length === 0 && input.plate !== null) rows.push({ kind: "plate", key: "empty", words: input.plate, group: null, list: true });
	return { rows: withBranches(rows) };
}

/** The node's tasks in their parts (By subprojects), as the old screen's `ProjectTasks` draws them. */
export function projectsList(view: ProjectsView): ListModel {
	const rows: ListRow[] = [];
	if (view.sections.length === 0) rows.push({ kind: "plate", key: "plate:none", words: view.emptyLabel, group: null, list: true });
	for (const section of view.sections) {
		if (section.header && section.title !== null) rows.push({ kind: "head", key: `head:${section.key}`, name: section.title, ungrouped: false, group: section.group });
		if (section.plate) rows.push({ kind: "plate", key: `plate:${section.key}`, words: view.emptyLabel, group: section.group, list: false });
		let owner = "";
		for (const row of section.rows) {
			if (row.card) owner = row.id;
			if (owner === "") continue;
			rows.push({ kind: "card", key: row.id, item: row.item, level: row.level, group: section.group, branch: null, face: cardFace(row.item, null, row.card?.stage ?? null), owner });
		}
	}
	return { rows: withBranches(rows) };
}

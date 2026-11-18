import { type Branch, branchOf, type GroupName, type ListSection, listView, type ProjectsSection, type ProjectsStage, type ProjectsView, type TaskItem } from "../../../core/application/contracts";

/** A card row of a list as drawn: the task by id, its depth, the branch lines from its task (none at the top level). */
export interface RowModel {
	readonly id: string;
	readonly level: number;
	readonly branch: Branch | null;
	/** By project: the stage's mark in the card's corner, or its date (`ProjectsCard.stage`); undefined: the card's own corner. */
	readonly stage?: ProjectsStage | null;
}

/** A section of a list as drawn: its header (when the list shows headers), the No tasks plate when empty, its rows. */
export interface GroupModel {
	readonly id: string;
	readonly name: GroupName;
	/** The header's words where they are not the section's name: a subproject's in By project. */
	readonly title?: string | null;
	readonly header: boolean;
	readonly empty: boolean;
	readonly rows: readonly RowModel[];
}

/** A list as a column draws it: its groups in order, and the plate a list that draws nothing shows (null: none). */
export interface ColumnModel {
	readonly groups: readonly GroupModel[];
	readonly plate: string | null;
}

export const EMPTY_COLUMN: ColumnModel = { groups: [], plate: null };

/**
 * A list's drawing from the core's grouping (`listView`) and branches (`branchOf`): nothing decided here, only the shape
 * the components draw. `sections` null: the list shows none; `plate`: the words of the No tasks plate of a list with no row.
 */
export function columnModel(items: readonly TaskItem[], sections: readonly ListSection[] | null, plate: string | null): ColumnModel {
	const view = listView(items, sections !== null, sections ?? []);
	const levels = view.groups.flatMap((group) => group.rows.map((row) => row.level));
	let index = 0;
	const groups = view.groups.map((group) => ({
		id: group.id,
		name: group.name,
		header: view.showsHeaders && group.header,
		empty: group.empty,
		rows: group.rows.map((row) => ({ id: row.item.id, level: row.level, branch: branchOf(levels, index++) })),
	}));
	const drawsNothing = groups.every((group) => group.rows.length === 0 && !group.header);
	return { groups: drawsNothing ? [] : groups, plate: drawsNothing ? plate : null };
}

/** `next` itself, or `prev` when the two are the same as data: what a selector sees unchanged keeps its identity. */
export function shared<T>(prev: T | undefined, next: T): T {
	return prev !== undefined && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/** A part's rows from its first card on: a row before any card of the part belongs to none (`ProjectsListRow.card`). */
function ownedRows(section: ProjectsSection): ProjectsSection["rows"] {
	const first = section.rows.findIndex((row) => row.card !== null);
	return first < 0 ? [] : section.rows.slice(first);
}

/** The node's tasks by project (`ProjectsView`) as a list draws them: a part per subproject, its rows and their stages. */
export function projectsModel(view: ProjectsView): ColumnModel {
	const levels = view.sections.flatMap((section) => ownedRows(section).map((row) => row.level));
	let index = 0;
	const groups = view.sections.map((section) => ({
		id: section.key,
		name: section.group,
		title: section.title,
		header: section.header,
		empty: section.plate,
		rows: ownedRows(section).map((row) => ({ id: row.item.id, level: row.level, branch: branchOf(levels, index++), stage: row.card ? row.card.stage : undefined })),
	}));
	return { groups, plate: view.sections.length === 0 ? view.emptyLabel : null };
}

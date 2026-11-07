import type { GroupedList } from "../domain/Lists";
import { projectKey } from "../domain/Project";
import type { GroupName } from "../domain/Task";
import type { ListSection, ProjectZone, TaskItem } from "./contracts";

/** A task of a list at its depth: 0 for a task, one more for each task above a subtask. */
export interface ListRow {
	readonly item: TaskItem;
	readonly level: number;
}

/** The tasks of one section of a list, in file order. */
export interface ListGroup {
	readonly name: GroupName;
	readonly items: readonly TaskItem[];
	/** The rows its column draws: each task, then its open subtasks a level deeper, unless they are folded away. */
	readonly rows: readonly ListRow[];
	/** A section with no task: its header stands over the No tasks plate. No section is never empty. */
	readonly empty: boolean;
	/**
	 * What its header's menu offers, the section it names: a section is renamed or removed; No section has no menu (null).
	 * Inside a project's group, `project` is that group's zone: `renameGroup` and `removeGroup` take it and touch only its tasks.
	 */
	readonly menu: { readonly section: string; readonly rename: boolean; readonly remove: boolean; readonly project?: ProjectZone } | null;
	/** It draws a header: a section of a list that shows them; never the tasks without a section inside a project's group. */
	readonly header: boolean;
	/** A long press lifts its header to move it among the list's sections: a section, while the list is not grouped by project. */
	readonly reorder: boolean;
}

function rowsOf(items: readonly TaskItem[], level = 0): ListRow[] {
	return items.flatMap((item) => [{ item, level }, ...(item.collapsed ? [] : rowsOf(item.subtasks, level + 1))]);
}

function groupOf(name: GroupName, items: readonly TaskItem[], header = true): ListGroup {
	const section = name !== null;
	return { name, items, rows: rowsOf(items), empty: section && items.length === 0, menu: section ? { section: name, rename: true, remove: true } : null, header, reorder: section };
}

/** A section of a project's group: its header unless it is the part without a section; its menu touches only that project's tasks; it does not lift. */
export function projectSection(name: GroupName, items: readonly TaskItem[], project: ProjectZone): ListGroup {
	const plain = groupOf(name, items, name !== null);
	return { ...plain, menu: plain.menu && { ...plain.menu, project }, reorder: false };
}

/**
 * A list as its column draws it: its sections, and whether they show headers. A group with no items is an empty section,
 * drawn as its heading over the No tasks plate (empty sections spec §5.2).
 */
export interface ListView {
	/** Once the column shows a section, an empty one too; the tasks outside any alone need none (sections spec §5.1). */
	readonly showsHeaders: boolean;
	readonly groups: readonly ListGroup[];
}

/**
 * The tasks of a list in its sections. A list that shows sections has each section's tasks where the section first shows (a
 * later day's column lists Now's tasks before Soon's, and a section's tasks gather where it first shows), and its list's
 * empty sections, each right after the last group drawn that stands above it in the file (`sections`, in file order;
 * empty sections spec §5). One that shows none: all its tasks outside any.
 */
export function listView(items: readonly TaskItem[], sections: boolean, listSections: readonly ListSection[] = []): ListView {
	if (!sections) return { showsHeaders: false, groups: [groupOf(null, items, false)] };
	const groups = withEmptySections(byGroup(items), listSections);
	const showsHeaders = groups.some((g) => g.name !== null);
	return { showsHeaders, groups: groups.map((g) => ({ ...g, header: showsHeaders })) };
}

function byGroup(items: readonly TaskItem[]): ListGroup[] {
	const groups: { name: GroupName; items: TaskItem[] }[] = [];
	for (const item of items) {
		const group = groups.find((g) => g.name === item.group);
		if (group) group.items.push(item);
		else groups.push({ name: item.group, items: [item] });
	}
	return groups.map((g) => groupOf(g.name, g.items));
}

export function withEmptySections(groups: readonly ListGroup[], sections: readonly ListSection[]): readonly ListGroup[] {
	const drawn = [...groups];
	sections.forEach((section, i) => {
		if (!section.empty || drawn.some((g) => g.name === section.name)) return;
		const above = new Set(sections.slice(0, i).map((s) => s.name));
		let at = 0;
		drawn.forEach((g, j) => {
			if (above.has(g.name)) at = j + 1;
		});
		drawn.splice(at, 0, groupOf(section.name, []));
	});
	return drawn;
}

/** The sections of tasks on a screen, in the order they show, with the list's empty sections where its column draws them. */
export function shownSections(groups: readonly GroupName[], sections: readonly ListSection[]): readonly GroupName[] {
	const shown = groups.reduce<ListGroup[]>((all, name) => (all.some((g) => g.name === name) ? all : [...all, groupOf(name, [])]), []);
	return withEmptySections(shown, sections).map((g) => g.name);
}

/**
 * Where in its list's sections a task can go: the menu of a card in a column that shows its list's sections has them
 * (`menuOffer`); a subtask, a done task, a timeline card, a stack's subtask and the whole screen none.
 */
export interface SectionChoice {
	/** The sections the list has, in its order, then the presets it lacks, in the settings' order. */
	readonly names: readonly string[];
	readonly current: GroupName;
	/** The name of the tasks outside any section. */
	readonly ungrouped: string;
}

/**
 * The sections a task's menu offers in each list, read with the screen of a day: those the list's tasks on the screen stand
 * in, in the order they show (the day column first, then Soon, Inbox and Backlog), the list's empty sections where they
 * show, then the presets it lacks.
 */
export interface SectionOffer {
	readonly lists: Readonly<Record<GroupedList, readonly string[]>>;
	/**
	 * In a list grouped by project, the sections each group offers (by `ProjectGroup.key`): those shown in it, then the
	 * presets; a task's menu there offers its group's.
	 */
	readonly projects?: Partial<Record<GroupedList, Readonly<Record<string, readonly string[]>>>>;
	/** The name of the tasks outside any section. */
	readonly ungrouped: string;
}

/** The sections of `groups` in their order, then the presets, trimmed; none twice, none blank, and the No section name none of them. */
export function offeredNames(groups: readonly GroupName[], presets: readonly string[], ungrouped: string): readonly string[] {
	const names = [...groups.flatMap((group) => (group === null ? [] : [group])), ...presets.map((preset) => preset.trim())];
	return [...new Set(names)].filter((name) => name !== "" && name !== ungrouped);
}

/** Where the tasks can go among their list's sections, the first one's current; none for a subtask, a done task, or tasks of two lists. */
export function sectionChoice(tasks: readonly TaskItem[], offer: SectionOffer): SectionChoice | null {
	const first = tasks[0];
	const list = first?.list;
	if (!first || list === "done" || tasks.some((task) => task.isSubtask || task.list !== list)) return null;
	const byProject = offer.projects?.[list];
	const key = groupKeyOf(first);
	const names = byProject && tasks.every((task) => groupKeyOf(task) === key) ? (byProject[key] ?? offer.lists[list]) : offer.lists[list];
	return { names, current: first.group, ungrouped: offer.ungrouped };
}

/** The key of the group a task stands in in a list grouped by project: its project's name, "" for none. */
export function groupKeyOf(item: TaskItem): string {
	return item.project ? projectKey(item.project.name) : "";
}

import type { GroupedList } from "../domain/Lists";
import type { GroupName } from "../domain/Task";
import type { TaskItem } from "./contracts";

/** The tasks of one section of a list, in file order. */
export interface ListGroup {
	readonly name: GroupName;
	readonly items: readonly TaskItem[];
}

/** A list as its column draws it: its sections, and whether they show headers. */
export interface ListView {
	/** Once the list has a section; the tasks outside any alone need none (sections spec §5.1). */
	readonly showsHeaders: boolean;
	readonly groups: readonly ListGroup[];
}

/**
 * The tasks of a list in its sections. A list that shows sections has each section's tasks where the section first shows (a
 * later day's column lists Now's tasks before Soon's, and a section's tasks gather where it first shows); one that shows none, all its tasks outside any.
 */
export function listView(items: readonly TaskItem[], sections: boolean): ListView {
	if (!sections) return { showsHeaders: false, groups: [{ name: null, items }] };
	const groups: { name: GroupName; items: TaskItem[] }[] = [];
	for (const item of items) {
		const group = groups.find((g) => g.name === item.group);
		if (group) group.items.push(item);
		else groups.push({ name: item.group, items: [item] });
	}
	return { showsHeaders: groups.some((g) => g.name !== null), groups };
}

/** Where in its list's sections a task can go: a list card's menu has them; a subtask, a timeline card or a done task none. */
export interface SectionChoice {
	/** The sections the list has, in its order, then the presets it lacks, in the settings' order. */
	readonly names: readonly string[];
	readonly current: GroupName;
	/** The name of the tasks outside any section. */
	readonly ungrouped: string;
}

/**
 * The sections a task's menu offers in each list, read with the screen of a day: those the list's tasks on the screen stand
 * in, in the order they show (the day column first, then Soon, Inbox and Backlog), then the presets it lacks.
 */
export interface SectionOffer {
	readonly lists: Readonly<Record<GroupedList, readonly string[]>>;
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
	return { names: offer.lists[list], current: first.group, ungrouped: offer.ungrouped };
}

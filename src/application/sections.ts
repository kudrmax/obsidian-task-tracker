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

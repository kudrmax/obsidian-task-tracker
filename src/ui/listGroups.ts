import type { GroupName, TaskItem, TaskKey } from "../application/contracts";

/** The cards of one section of a list, in file order. */
export interface ListGroup {
	readonly name: GroupName;
	readonly items: readonly TaskItem[];
}

/** Where a card dropped into a gap lands: right before a task, or at the end of a section. */
export interface GapPlace {
	readonly group: GroupName;
	readonly before: TaskKey | null;
}

/** A gap of the list: where it puts the card, and the first of the list's elements (headers and cards) that steps aside for it. */
export interface ListGap {
	readonly place: GapPlace;
	readonly at: number;
}

/** The items of each section, the sections in the order they first show; a later day's column lists Now's tasks before Soon's, so a section may show twice. */
export function listGroups(items: readonly TaskItem[]): readonly ListGroup[] {
	const groups: { name: GroupName; items: TaskItem[] }[] = [];
	for (const item of items) {
		const group = groups.find((g) => g.name === item.group);
		if (group) group.items.push(item);
		else groups.push({ name: item.group, items: [item] });
	}
	return groups;
}

/** Headers show once a list has a section; the tasks outside any alone need none (sections spec §5.1). */
export function showsHeaders(groups: readonly ListGroup[]): boolean {
	return groups.some((g) => g.name !== null);
}

/**
 * The gaps of a list, top to bottom: before each card of a section and after its last one. With headers and no task
 * outside any section, a gap above the first header puts the card there. The dragged card makes no gap of its own.
 */
export function listGaps(groups: readonly ListGroup[], headers: boolean, dragged?: TaskKey): readonly ListGap[] {
	const gaps: ListGap[] = [];
	if (headers && !groups.some((g) => g.name === null)) gaps.push({ place: { group: null, before: null }, at: 0 });
	let at = 0;
	for (const group of groups) {
		if (headers) at++;
		for (const item of group.items) {
			if (!sameKey(item.key, dragged)) gaps.push({ place: { group: group.name, before: item.key }, at });
			at++;
		}
		gaps.push({ place: { group: group.name, before: null }, at });
	}
	return gaps;
}

export function gapPlace(groups: readonly ListGroup[], headers: boolean, gap: number): GapPlace {
	return listGaps(groups, headers)[gap].place;
}

function sameKey(a: TaskKey, b: TaskKey | undefined): boolean {
	return b !== undefined && a.section === b.section && a.index === b.index;
}

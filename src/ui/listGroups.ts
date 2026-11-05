import { type GroupName, type ListGroup, samePlace, type TaskKey } from "../application/contracts";

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
			if (!dragged || !samePlace(item.key, dragged)) gaps.push({ place: { group: group.name, before: item.key }, at });
			at++;
		}
		gaps.push({ place: { group: group.name, before: null }, at });
	}
	return gaps;
}

export function gapPlace(groups: readonly ListGroup[], headers: boolean, gap: number): GapPlace {
	return listGaps(groups, headers)[gap].place;
}

import type { GroupName, GroupPlace, ProjectZone, TaskKey } from "./contracts";
import { samePlace } from "./taskKeys";

/**
 * A card as the levels around a place see it: how deep, and the section it is drawn in (none in a list that shows none);
 * in a list grouped by project or a project's view, also the project's part it is drawn in (`ProjectGroup.zone`).
 */
export interface LevelCard {
	readonly level: number;
	readonly group: GroupName;
	readonly project?: ProjectZone;
}

/** A header a finger passed: a section's name, or in a list grouped by project a section of a project's part (`group` null: the part's tasks without a section). */
export type Header = GroupName | { readonly group: GroupName; readonly project: ProjectZone };

/** A section and the project's part it is in, as a place or a card names them. */
interface Zone {
	readonly group: GroupName;
	readonly project?: ProjectZone;
}

/** The same section of the same project's part; outside a grouped list, the same section. */
function sameZone(a: Zone, b: Zone): boolean {
	return a.group === b.group && a.project === b.project;
}

function zoneOf(header: Header): Zone {
	return header !== null && typeof header === "object" ? header : { group: header };
}

/** The place's project, only where it has one: a place of a plain list carries none. */
function withProject<T extends object>(place: T, project: ProjectZone | undefined): T & { readonly project?: ProjectZone } {
	return project === undefined ? place : { ...place, project };
}

/** A card of the list as a place in it sees it: also its task. */
export interface ListCard extends LevelCard {
	readonly key: TaskKey;
	/** Its task's id (`TaskItem.id`): a card given one is found by it, wherever writes since moved its key. */
	readonly id?: string;
}

/** Where a dropped card goes: only ever between cards, into the gap before card `index` at `level`, in section `group`. */
export interface GapPlace {
	readonly kind: "gap";
	readonly index: number;
	readonly level: number;
	readonly group: GroupName;
	/** In a project's part: its zone. */
	readonly project?: ProjectZone;
}

/** What a place means for the file: a task in `group` before another one (null: its end), or a subtask of `parent` before `before` (null: last). */
export type ListPlace =
	| { readonly kind: "task"; readonly group: GroupName; readonly before: TaskKey | null; readonly project?: ProjectZone }
	| { readonly kind: "subtask"; readonly parent: TaskKey; readonly before: TaskKey | null };

/**
 * The levels a card may take in the gap before card `index`, in section `group`: no shallower than the card below, no deeper
 * than one under the card above. Neighbours of another section do not count, so a header breaks nesting.
 */
export function levelRange(cards: readonly LevelCard[], index: number, group: GroupName, project?: ProjectZone): { readonly min: number; readonly max: number } {
	const zone = withProject({ group }, project);
	const prev = cards[index - 1] && sameZone(cards[index - 1], zone) ? cards[index - 1] : undefined;
	const next = cards[index] && sameZone(cards[index], zone) ? cards[index] : undefined;
	return { min: next?.level ?? 0, max: prev ? prev.level + 1 : 0 };
}

/** The place at the level nearest its own that the neighbours allow. */
export function fitLevel(cards: readonly LevelCard[], place: GapPlace): GapPlace {
	const { min, max } = levelRange(cards, place.index, place.group, place.project);
	return { ...place, level: Math.max(min, Math.min(max, place.level)) };
}

/** The place one level deeper (`delta` 1) or shallower (-1), or null when the neighbours do not allow it. */
export function shiftLevel(cards: readonly LevelCard[], place: GapPlace, delta: 1 | -1): GapPlace | null {
	const level = place.level + delta;
	const { min, max } = levelRange(cards, place.index, place.group, place.project);
	return level >= min && level <= max ? { ...place, level } : null;
}

/** What a gap means: at the first level a task before the next task of its section; deeper a subtask of the nearest card a level up, before the next one at its level. */
export function placeOfGap(cards: readonly ListCard[], place: GapPlace): ListPlace {
	const next = cards[place.index] && sameZone(cards[place.index], place) ? cards[place.index] : undefined;
	const before = next && next.level === place.level ? next.key : null;
	if (place.level === 0) return withProject({ kind: "task", group: place.group, before }, place.project);
	let parent = place.index - 1;
	while (cards[parent].level !== place.level - 1) parent--;
	return { kind: "subtask", parent: cards[parent].key, before };
}

/**
 * The gap a place means, read back as `placeOfGap` writes it: right before `before` at its level; else after the whole of
 * the parent's subtree a level under it, or at the end of the section (above every header for the tasks outside any,
 * when none of them shows).
 */
export function gapOfPlace(cards: readonly ListCard[], place: ListPlace): GapPlace {
	const at = (key: TaskKey) => cards.findIndex((card) => samePlace(card.key, key));
	const before = place.before ? at(place.before) : -1;
	if (before >= 0) return withProject({ kind: "gap", index: before, level: cards[before].level, group: cards[before].group }, cards[before].project);
	const parent = place.kind === "subtask" ? at(place.parent) : -1;
	if (parent >= 0) {
		let end = parent + 1;
		while (end < cards.length && cards[end].level > cards[parent].level) end++;
		return withProject({ kind: "gap", index: end, level: cards[parent].level + 1, group: cards[parent].group }, cards[parent].project);
	}
	const zone: Zone = place.kind === "task" ? withProject({ group: place.group }, place.project) : { group: null };
	let last = cards.length - 1;
	while (last >= 0 && !sameZone(cards[last], zone)) last--;
	const first = zone.group === null && zone.project === undefined;
	return withProject({ kind: "gap", index: last >= 0 ? last + 1 : first ? 0 : cards.length, level: 0, group: zone.group }, zone.project);
}

/** The same place but perhaps for its level: the same gap in the same section. */
export function sameGap(a: GapPlace, b: GapPlace): boolean {
	return a.index === b.index && sameZone(a, b);
}

/**
 * The gap before card `index`, the card's left edge at `level` (fractional). Its section: that of the last header the
 * finger is past at this gap (`passed`, in their order); else the card's above it; above every card the tasks outside
 * any section when the list shows headers (`headers`), else the first card's. The level is the nearest the neighbours allow.
 */
export function gapAt(cards: readonly LevelCard[], index: number, level: number, passed: readonly Header[], headers: boolean): GapPlace {
	const above: Zone = index > 0 ? cards[index - 1] : headers ? { group: null } : (cards[0] ?? { group: null });
	const zone = passed.length > 0 ? zoneOf(passed[passed.length - 1]) : above;
	return fitLevel(cards, withProject({ kind: "gap", index, level: Math.round(level), group: zone.group }, zone.project));
}

/**
 * What letting go in `place` means (`placeOfGap`), `cards` without the lifted ones; null when it changes nothing: a card
 * carried alone let go where it was lifted from (`home`), at its level. Several cards carried, or a new task, have no home.
 */
export function placeOfDrop(cards: readonly ListCard[], place: GapPlace, home: GapPlace | null): ListPlace | null {
	if (home && sameGap(place, home) && place.level === home.level) return null;
	return placeOfGap(cards, place);
}

/** Where section `lifted` of `groups` goes, let go at slot `slot` (before the group standing there, or past the last): before that group, or last; null at its own place. */
export function groupPlaceOf(groups: readonly GroupName[], lifted: number, slot: number): GroupPlace | null {
	if (slot === lifted || slot === lifted + 1) return null;
	return slot >= groups.length ? "end" : { before: groups[slot] };
}

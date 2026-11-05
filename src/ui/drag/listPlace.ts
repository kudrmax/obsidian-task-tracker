import { type GroupName, samePlace, type TaskKey } from "../../application/contracts";

/** A card as the levels around a place see it: how deep, and the section it is drawn in (none in a list that shows none). */
export interface LevelCard {
	readonly level: number;
	readonly group: GroupName;
}

/** A card of the list as a place in it sees it: also its task. */
export interface ListCard extends LevelCard {
	readonly key: TaskKey;
}

/** A card of the list as the drop sees it: also where it stands. */
export interface PlacedCard extends ListCard {
	readonly top: number;
	readonly height: number;
}

/** A section's header as the drop sees it: where it stands, and the first card after it (the number of cards when none is). */
export interface PlacedHead {
	readonly group: GroupName;
	readonly firstCard: number;
	readonly top: number;
	readonly height: number;
}

/** Where a dropped card goes: only ever between cards, into the gap before card `index` at `level`, in section `group`. */
export interface GapPlace {
	readonly kind: "gap";
	readonly index: number;
	readonly level: number;
	readonly group: GroupName;
}

/** What a place means for the file: a task in `group` before another one (null: its end), or a subtask of `parent` before `before` (null: last). */
export type PlaceResult =
	| { readonly kind: "task"; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "subtask"; readonly parent: TaskKey; readonly before: TaskKey | null };

/** The order of a section among the headers; -1 for the tasks outside any while they show no header. */
function orderOf(heads: readonly PlacedHead[], group: GroupName): number {
	return heads.findIndex((h) => h.group === group);
}

/** The same place but perhaps for its level: the same gap in the same section. */
export function sameGap(a: GapPlace, b: GapPlace): boolean {
	return a.index === b.index && a.group === b.group;
}

/**
 * Where the finger at `y` puts the card, its left edge at `level` (fractional), seen against the list as it stands with
 * `room` open: the cards and headers standing as they do with the dragged card gone, those after an open gap on `shift`
 * lower (a card as the room opens nothing). The card never goes into another one: it goes into the gap among the cards'
 * middles as they stand; between two sections, a header's middle says which side of it. The
 * level is the one nearest `level` that the neighbours in that section allow: no deeper than one under the card above, no
 * shallower than the card below. A header breaks nesting: the first card under it is a task.
 *
 * `held`, the place shown now, keeps the finger until it is more than `hysteresis` px past that place's edge, so at an
 * edge the place does not flip between its two sides; its level still follows the finger.
 */
export function placeAt(
	cards: readonly PlacedCard[],
	y: number,
	level: number,
	shift: number,
	room: GapPlace | null,
	heads: readonly PlacedHead[] = [],
	held: GapPlace | null = null,
	hysteresis = 0,
): GapPlace {
	const at = (finger: number) => rawPlaceAt(cards, finger, level, shift, room, heads);
	const place = at(y);
	if (!held || hysteresis <= 0 || sameGap(place, held)) return place;
	if (!sameGap(at(y - hysteresis), held) && !sameGap(at(y + hysteresis), held)) return place;
	return fitLevel(cards, { ...held, level: Math.round(level) });
}

function rawPlaceAt(cards: readonly PlacedCard[], y: number, level: number, shift: number, gap: GapPlace | null, heads: readonly PlacedHead[]): GapPlace {
	const top = (i: number) => cards[i].top + (gap && i >= gap.index ? shift : 0);
	const headAfterGap = (h: PlacedHead) => gap !== null && (h.firstCard > gap.index || (h.firstCard === gap.index && orderOf(heads, h.group) > orderOf(heads, gap.group)));
	/** Past this a finger is under the header. The first header with no task outside any section above it takes its whole height: above it is where a card leaves every section. */
	const headEdge = (h: PlacedHead, i: number) => h.top + (headAfterGap(h) ? shift : 0) + (i === 0 && h.group !== null ? h.height : h.height / 2);
	const index = cards.filter((c, i) => y > top(i) + c.height / 2).length;
	let group: GroupName = index > 0 ? cards[index - 1].group : heads.length > 0 ? null : (cards[0]?.group ?? null);
	heads.forEach((head, i) => {
		if (head.firstCard === index && y > headEdge(head, i)) group = head.group;
	});
	return fitLevel(cards, { kind: "gap", index, level: Math.round(level), group });
}

/**
 * The levels a card may take in the gap before card `index`, in section `group`: no shallower than the card below, no deeper
 * than one under the card above. Neighbours of another section do not count, so a header breaks nesting.
 */
export function levelRange(cards: readonly LevelCard[], index: number, group: GroupName): { readonly min: number; readonly max: number } {
	const prev = cards[index - 1]?.group === group ? cards[index - 1] : undefined;
	const next = cards[index]?.group === group ? cards[index] : undefined;
	return { min: next?.level ?? 0, max: prev ? prev.level + 1 : 0 };
}

/** The place at the level nearest its own that the neighbours allow. */
export function fitLevel(cards: readonly LevelCard[], place: GapPlace): GapPlace {
	const { min, max } = levelRange(cards, place.index, place.group);
	return { ...place, level: Math.max(min, Math.min(max, place.level)) };
}

/** The place one level deeper (`delta` 1) or shallower (-1), or null when the neighbours do not allow it. */
export function shiftLevel(cards: readonly LevelCard[], place: GapPlace, delta: 1 | -1): GapPlace | null {
	const level = place.level + delta;
	const { min, max } = levelRange(cards, place.index, place.group);
	return level >= min && level <= max ? { ...place, level } : null;
}

export function resultOf(cards: readonly ListCard[], place: GapPlace): PlaceResult {
	const next = cards[place.index]?.group === place.group ? cards[place.index] : undefined;
	const before = next && next.level === place.level ? next.key : null;
	if (place.level === 0) return { kind: "task", group: place.group, before };
	let parent = place.index - 1;
	while (cards[parent].level !== place.level - 1) parent--;
	return { kind: "subtask", parent: cards[parent].key, before };
}

/**
 * The gap a result means, read back as `resultOf` writes it: right before `before` at its level; else after the whole of
 * the parent's subtree a level under it, or at the end of the section (above every header for the tasks outside any,
 * when none of them shows).
 */
export function gapOf(cards: readonly ListCard[], result: PlaceResult): GapPlace {
	const at = (key: TaskKey) => cards.findIndex((card) => samePlace(card.key, key));
	const before = result.before ? at(result.before) : -1;
	if (before >= 0) return { kind: "gap", index: before, level: cards[before].level, group: cards[before].group };
	const parent = result.kind === "subtask" ? at(result.parent) : -1;
	if (parent >= 0) {
		let end = parent + 1;
		while (end < cards.length && cards[end].level > cards[parent].level) end++;
		return { kind: "gap", index: end, level: cards[parent].level + 1, group: cards[parent].group };
	}
	const group = result.kind === "task" ? result.group : null;
	let last = cards.length - 1;
	while (last >= 0 && cards[last].group !== group) last--;
	return { kind: "gap", index: last >= 0 ? last + 1 : group === null ? 0 : cards.length, level: 0, group };
}

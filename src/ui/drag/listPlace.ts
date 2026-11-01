import type { GroupName, TaskKey } from "../../application/contracts";

/** A card of the list as the drop sees it: where it stands, how deep, and in which section. */
export interface PlacedCard {
	readonly key: TaskKey;
	readonly level: number;
	readonly top: number;
	readonly height: number;
	readonly group: GroupName;
}

/** A section's header as the drop sees it: where it stands, and the first card after it (the number of cards when none is). */
export interface PlacedHead {
	readonly group: GroupName;
	readonly firstCard: number;
	readonly top: number;
	readonly height: number;
}

/** Where a dropped card goes: into another card, or into the gap before card `index` at `level`, in section `group`. */
export type ListPlace =
	| { readonly kind: "into"; readonly index: number }
	| { readonly kind: "gap"; readonly index: number; readonly level: number; readonly group: GroupName };

/** A place between cards. */
export type GapPlace = Extract<ListPlace, { kind: "gap" }>;

/** What a place means for the file: a task in `group` before another one (null: its end), or a subtask of `parent` before `before` (null: last). */
export type PlaceResult =
	| { readonly kind: "task"; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "subtask"; readonly parent: TaskKey; readonly before: TaskKey | null };

/** How far into a card, from either edge, the finger is still beside it rather than over it. */
const INTO_EDGE = 0.2;

/** The order of a section among the headers; -1 for the tasks outside any while they show no header. */
function orderOf(heads: readonly PlacedHead[], group: GroupName): number {
	return heads.findIndex((h) => h.group === group);
}

/**
 * Where the finger at `y` puts the card, its left edge at `level` (fractional), seen against the list as it shows `current`:
 * the cards and headers standing as they do with the dragged card gone, those after an open gap on `shift` lower. Over the
 * middle of a card as it stands the card goes into it. Elsewhere it goes into the gap among the cards' middles as they
 * stand; between two sections, a header's middle says which side of it. The level is the one nearest `level` that the
 * neighbours in that section allow: no deeper than one under the card above, no shallower than the card below. A header
 * breaks nesting: the first card under it is a task.
 */
export function placeAt(cards: readonly PlacedCard[], y: number, level: number, shift: number, current: ListPlace, heads: readonly PlacedHead[] = []): ListPlace {
	const gap = current.kind === "gap" ? current : null;
	const top = (i: number) => cards[i].top + (gap && i >= gap.index ? shift : 0);
	const headAfterGap = (h: PlacedHead) => gap !== null && (h.firstCard > gap.index || (h.firstCard === gap.index && orderOf(heads, h.group) > orderOf(heads, gap.group)));
	/** Past this a finger is under the header. The first header with no task outside any section above it takes its whole height: above it is where a card leaves every section. */
	const headEdge = (h: PlacedHead, i: number) => h.top + (headAfterGap(h) ? shift : 0) + (i === 0 && h.group !== null ? h.height : h.height / 2);
	const into = cards.findIndex((c, i) => y > top(i) + c.height * INTO_EDGE && y < top(i) + c.height * (1 - INTO_EDGE));
	if (into >= 0) return { kind: "into", index: into };
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
export function levelRange(cards: readonly PlacedCard[], index: number, group: GroupName): { readonly min: number; readonly max: number } {
	const prev = cards[index - 1]?.group === group ? cards[index - 1] : undefined;
	const next = cards[index]?.group === group ? cards[index] : undefined;
	return { min: next?.level ?? 0, max: prev ? prev.level + 1 : 0 };
}

/** The place at the level nearest its own that the neighbours allow. */
export function fitLevel(cards: readonly PlacedCard[], place: GapPlace): GapPlace {
	const { min, max } = levelRange(cards, place.index, place.group);
	return { ...place, level: Math.max(min, Math.min(max, place.level)) };
}

/** The place one level deeper (`delta` 1) or shallower (-1), or null when the neighbours do not allow it. */
export function shiftLevel(cards: readonly PlacedCard[], place: GapPlace, delta: 1 | -1): GapPlace | null {
	const level = place.level + delta;
	const { min, max } = levelRange(cards, place.index, place.group);
	return level >= min && level <= max ? { ...place, level } : null;
}

export function resultOf(cards: readonly PlacedCard[], place: ListPlace): PlaceResult {
	if (place.kind === "into") return { kind: "subtask", parent: cards[place.index].key, before: null };
	const next = cards[place.index]?.group === place.group ? cards[place.index] : undefined;
	const before = next && next.level === place.level ? next.key : null;
	if (place.level === 0) return { kind: "task", group: place.group, before };
	let parent = place.index - 1;
	while (cards[parent].level !== place.level - 1) parent--;
	return { kind: "subtask", parent: cards[parent].key, before };
}

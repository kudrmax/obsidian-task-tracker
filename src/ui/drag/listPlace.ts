import type { TaskKey } from "../../application/contracts";

/** A card of the list as the drop sees it: where it stands and how deep. */
export interface PlacedCard {
	readonly key: TaskKey;
	readonly level: number;
	readonly top: number;
	readonly height: number;
}

/** Where a card dropped in its own list goes: into another card, or into the gap before `index` at `level`. */
export type ListPlace =
	| { readonly kind: "into"; readonly index: number }
	| { readonly kind: "gap"; readonly index: number; readonly level: number };

/** What a place means for the file: a task before another one (null: the end), or a subtask of `parent` before `before` (null: last). */
export type PlaceResult =
	| { readonly kind: "task"; readonly before: TaskKey | null }
	| { readonly kind: "subtask"; readonly parent: TaskKey; readonly before: TaskKey | null };

/** How far into a card, from either edge, the finger is still beside it rather than over it. */
const INTO_EDGE = 0.2;

/**
 * Where the finger at `y` puts the card, its left edge at `level` (fractional), seen against the list as it shows `current`:
 * the cards standing as they do with the dragged card gone, those from an open gap on `shift` lower. Over the middle of a
 * card as it stands the card goes into it. Elsewhere it goes into the gap among the cards' middles as they stand, at the
 * level nearest `level` that the neighbours allow: no deeper than one under the card above, no shallower than the card below.
 */
export function placeAt(cards: readonly PlacedCard[], y: number, level: number, shift: number, current: ListPlace): ListPlace {
	const top = (i: number) => cards[i].top + (current.kind === "gap" && i >= current.index ? shift : 0);
	const into = cards.findIndex((c, i) => y > top(i) + c.height * INTO_EDGE && y < top(i) + c.height * (1 - INTO_EDGE));
	if (into >= 0) return { kind: "into", index: into };
	const index = cards.filter((c, i) => y > top(i) + c.height / 2).length;
	const deepest = index > 0 ? cards[index - 1].level + 1 : 0;
	const shallowest = cards[index]?.level ?? 0;
	return { kind: "gap", index, level: Math.max(shallowest, Math.min(deepest, Math.round(level))) };
}

export function resultOf(cards: readonly PlacedCard[], place: ListPlace): PlaceResult {
	if (place.kind === "into") return { kind: "subtask", parent: cards[place.index].key, before: null };
	const next = cards[place.index];
	const before = next && next.level === place.level ? next.key : null;
	if (place.level === 0) return { kind: "task", before };
	let parent = place.index - 1;
	while (cards[parent].level !== place.level - 1) parent--;
	return { kind: "subtask", parent: cards[parent].key, before };
}

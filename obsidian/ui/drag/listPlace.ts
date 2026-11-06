import { fitLevel, type GapPlace, gapAt, type GroupName, type ListCard, sameGap } from "../../../core/application/contracts";

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

/** The order of a section among the headers; -1 for the tasks outside any while they show no header. */
function orderOf(heads: readonly PlacedHead[], group: GroupName): number {
	return heads.findIndex((h) => h.group === group);
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
	const passed = heads.filter((head, i) => head.firstCard === index && y > headEdge(head, i)).map((head) => head.group);
	return gapAt(cards, index, level, passed, heads.length > 0);
}

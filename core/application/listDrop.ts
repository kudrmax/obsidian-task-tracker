import { fitLevel, type GapPlace, gapAt, type Header, type LevelCard, sameGap } from "./nesting";

/** A card of the list as a drop sees it: also where it stands. */
export interface PlacedCard extends LevelCard {
	readonly top: number;
	readonly height: number;
}

/**
 * A section's header as a drop sees it: where it stands, and the first card after it (the number of cards when none is).
 * In a list grouped by project, `group` names the project's part too; a project group's header opens its part.
 */
export interface PlacedHead {
	readonly group: Header;
	/** A project group's header, which opens a part of a list grouped by project. */
	readonly opens?: boolean;
	readonly firstCard: number;
	readonly top: number;
	readonly height: number;
}

/** The list's box across, in the frontend's units. */
export interface ListSpan {
	readonly left: number;
	readonly width: number;
}

/**
 * The level for a new task and a carried card alike, fractional: on the list's left half as shallow as the neighbours
 * allow; right of the middle a level deeper for each indent. So the hand picks a task, a subtask or one under that near
 * the middle of the list, never stretching to its left edge, wherever it holds the card.
 */
export function levelAt(x: number, list: ListSpan, indent: number): number {
	return indent > 0 ? (x - (list.left + list.width / 2)) / indent : 0;
}

/** Where a carried card's middle stands, the finger at `y` holding it `grabPx` below its top: a card is placed by its middle, a new task by the finger itself. */
export function carriedMiddle(y: number, grabPx: number, cardHeight: number): number {
	return y - grabPx + cardHeight / 2;
}

/** A gap under a header, which `sameGap` weighs by its section alone. */
function gapUnder(header: Header): GapPlace {
	return { kind: "gap", index: 0, level: 0, group: header };
}

/** The header a place's section is drawn under. */
function headerOfPlace(place: GapPlace): Header {
	return place.group;
}

/** The order of a section among the headers; -1 for the tasks outside any while they show no header. */
function orderOf(heads: readonly PlacedHead[], group: Header): number {
	return heads.findIndex((h) => sameGap(gapUnder(h.group), gapUnder(group)));
}

/** No section's header stands below another one: its tasks are drawn there, so the list's top is not theirs. */
function noSectionBelow(heads: readonly PlacedHead[]): boolean {
	return heads.some((head, i) => i > 0 && head.group === null);
}

/**
 * The first header stands at the list's top, whatever is above it is in its part: in a list grouped by project, never
 * outside every part; in one whose No section is drawn lower, never in No section, which is not there.
 */
function opensList(head: PlacedHead, i: number, heads: readonly PlacedHead[]): boolean {
	return i === 0 && (head.opens === true || noSectionBelow(heads));
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
	const headAfterGap = (h: PlacedHead) => gap !== null && (h.firstCard > gap.index || (h.firstCard === gap.index && orderOf(heads, h.group) > orderOf(heads, headerOfPlace(gap))));
	/** Past this a finger is under the header. The first header with no task outside any section above it takes its whole height: above it is where a card leaves every section. */
	const headEdge = (h: PlacedHead, i: number) => h.top + (headAfterGap(h) ? shift : 0) + (i === 0 && h.group !== null ? h.height : h.height / 2);
	const index = cards.filter((c, i) => y > top(i) + c.height / 2).length;
	const passed = heads.filter((head, i) => head.firstCard === index && (opensList(head, i, heads) || y > headEdge(head, i))).map((head) => head.group);
	return gapAt(cards, index, level, passed, heads.length > 0);
}

/**
 * A subtask's branch lines: whether it is the last of its task's subtasks (the line bends in) or a sibling follows (it
 * goes on), and for each task further up, from the outermost subtask level, whether that one's line goes on past the row.
 */
export interface Branch {
	readonly last: boolean;
	readonly through: readonly boolean[];
}

/** The branch of the row at `index` among rows of these `levels`, in drawing order; null for a task, which has none. */
export function branchOf(levels: readonly number[], index: number): Branch | null {
	const level = levels[index];
	if (level <= 0) return null;
	const goesOn = (l: number): boolean => levels.slice(index + 1).find((next) => next <= l) === l;
	return { last: !goesOn(level), through: Array.from({ length: level - 1 }, (_, k) => goesOn(k + 1)) };
}

/** The branch an open gap draws, as a row of its level standing before card `gap.index`; null at the tasks' level. */
export function gapBranch(cards: readonly Pick<LevelCard, "level">[], gap: GapPlace): Branch | null {
	const levels = cards.map((card) => card.level);
	levels.splice(gap.index, 0, gap.level);
	return branchOf(levels, gap.index);
}

/**
 * Where a carried card lands in a list, and at which depth (spec 2026-11-18, «Decided» 1): the screen's geometry, written for
 * the new screen. Whether the list takes the card at all is the port's.
 */

/** A card of the list as a drop sees it (the carried ones left out): its depth, its section (drawn order), its box along the list. */
export interface DropCard {
	readonly id: string;
	readonly depth: number;
	readonly section: number;
	readonly top: number;
	readonly height: number;
}

/** A section's header as a drop sees it: its section, the first card after it (the number of cards when none is), its box. */
export interface DropHead {
	readonly section: number;
	readonly firstCard: number;
	readonly top: number;
	readonly height: number;
}

/** A gap between cards: before card `index`, at `depth`, in section `section`. */
export interface Gap {
	readonly index: number;
	readonly depth: number;
	readonly section: number;
}

/** The depths a card may take before card `index` in `section`: no shallower than the card below, no deeper than one under the card above; a header breaks nesting. */
export function depthRange(cards: readonly DropCard[], index: number, section: number): { readonly min: number; readonly max: number } {
	const above = index > 0 && cards[index - 1].section === section ? cards[index - 1] : null;
	const below = index < cards.length && cards[index].section === section ? cards[index] : null;
	return { min: below?.depth ?? 0, max: above ? above.depth + 1 : 0 };
}

/**
 * The depth the finger asks for, fractional: on the list's left half as shallow as the neighbours allow; right of the
 * middle a level deeper for each `indent`. So the hand picks a task or a subtask near the middle, never at the edge.
 */
export function fingerDepth(x: number, list: { readonly left: number; readonly width: number }, indent: number): number {
	return indent > 0 ? (x - (list.left + list.width / 2)) / indent : 0;
}

/**
 * The gap a card whose middle stands at `y` goes into, the finger asking for `depth`: among the cards' middles as they
 * stand; under the last header the card is past at that gap (past its middle), else in the section of the card above.
 * `held`, the gap shown now, keeps it until the card is `hysteresis` past that gap's edge, so it does not flip at an edge.
 */
export function gapAt(cards: readonly DropCard[], heads: readonly DropHead[], y: number, depth: number, held: Gap | null = null, hysteresis = 0): Gap {
	const raw = (at: number): Gap => {
		const index = cards.filter((card) => at > card.top + card.height / 2).length;
		const passed = heads.filter((head) => head.firstCard === index && at > head.top + head.height / 2);
		const section = passed.length > 0 ? passed[passed.length - 1].section : index > 0 ? cards[index - 1].section : (heads[0]?.section ?? cards[0]?.section ?? 0);
		return fit(cards, { index, depth, section });
	};
	const gap = raw(y);
	if (!held || hysteresis <= 0 || sameGap(gap, held)) return gap;
	if (!sameGap(raw(y - hysteresis), held) && !sameGap(raw(y + hysteresis), held)) return gap;
	return fit(cards, { ...held, depth });
}

/** The same gap, whatever its depth. */
export function sameGap(a: Gap, b: Gap): boolean {
	return a.index === b.index && a.section === b.section;
}

/** The gap at the whole depth nearest its own that the neighbours allow. */
function fit(cards: readonly DropCard[], gap: Gap): Gap {
	const { min, max } = depthRange(cards, gap.index, gap.section);
	return { ...gap, depth: Math.max(min, Math.min(max, Math.round(gap.depth))) };
}

/** What a gap means: in its section, under the nearest card above it a level up (none at depth 0), before the next card at its depth (none: the end). */
export function placeOfGap(cards: readonly DropCard[], gap: Gap): { readonly section: number; readonly parent: string | null; readonly before: string | null } {
	const next = gap.index < cards.length && cards[gap.index].section === gap.section && cards[gap.index].depth === gap.depth ? cards[gap.index] : null;
	let parent: string | null = null;
	if (gap.depth > 0) {
		for (let i = gap.index - 1; i >= 0; i--) {
			if (cards[i].depth === gap.depth - 1) {
				parent = cards[i].id;
				break;
			}
		}
	}
	return { section: gap.section, parent, before: next?.id ?? null };
}

/** Where a carried section lands among the sections left: the gap before the first whose header's middle is below `y`. */
export function sectionSlot(heads: readonly DropHead[], y: number): number {
	return heads.filter((head) => head.top + head.height / 2 < y).length;
}

/** Where a carried card's middle stands, the finger at `y` holding it `grab` below its top. */
export function carriedMiddle(y: number, grab: number, height: number): number {
	return y - grab + height / 2;
}

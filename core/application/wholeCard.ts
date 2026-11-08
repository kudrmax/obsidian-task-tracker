/** A card's title as it is measured: the card's width, the title's box in it, the title's text on one line, its fade. */
export interface TitleFit {
	readonly width: number;
	readonly titleWidth: number;
	readonly textWidth: number;
	readonly fade: number;
}

/** The window a grown copy stays inside, and the margin it keeps from the window's edges. */
export interface WholeRoom {
	readonly width: number;
	readonly margin: number;
}

/** How wide the copy of a card grows, and whether its title is still cut at that width (it then wraps onto more lines). */
export interface GrownWidth {
	readonly width: number;
	readonly cut: boolean;
}

/**
 * How wide a pressed card's copy grows to show a title the card cuts or fades, on its one line: by what the title lacks,
 * up to the window less its margins, never narrower than the card. Null for a title shown whole: the card is lifted itself.
 */
export function wholeWidth(card: TitleFit, room: WholeRoom): GrownWidth | null {
	if (card.textWidth <= card.titleWidth - card.fade) return null;
	const missing = Math.ceil(card.textWidth - card.titleWidth);
	const widest = room.width - 2 * room.margin;
	const width = Math.max(card.width, Math.min(card.width + missing, widest));
	return { width, cut: width < card.width + missing };
}

/**
 * Where a grown copy starts on one axis: where the card did, pulled back only as far as it takes to end inside the
 * window's margin (or where the card ended, if that is further), and never pulled past the near margin.
 */
export function grownStart(start: number, size: number, grown: number, room: number, margin: number): number {
	const end = Math.max(start + size, room - margin);
	return Math.max(Math.min(start, margin), Math.min(start, end - grown));
}

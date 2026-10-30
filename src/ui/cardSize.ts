import { DEFAULT_SETTINGS } from "../settings";
import { PROPERTY, tokenPx } from "./design";
import { px } from "./dom";

/** A card's height and the gap between cards: the list, the stack on the timeline and every card lifted from them take these. */
export interface CardSize {
	readonly height: number;
	readonly gap: number;
}

/** The settings' size goes on the body: the tokens built on it live there, and so do the cards lifted out of the view. */
export function showCardSize(size: CardSize): void {
	document.body.style.setProperty(PROPERTY.cardHeight, px(size.height));
	document.body.style.setProperty(PROPERTY.cardGap, px(size.gap));
}

export function clearCardSize(): void {
	document.body.style.removeProperty(PROPERTY.cardHeight);
	document.body.style.removeProperty(PROPERTY.cardGap);
}

/** The size the cards are drawn at, read back from the body so it stays the one source; the defaults where no sheet is loaded. */
export function shownCardSize(): CardSize {
	const height = tokenPx(document.body, PROPERTY.cardHeight);
	if (!height) return { height: DEFAULT_SETTINGS.cardHeight, gap: DEFAULT_SETTINGS.cardGap };
	return { height, gap: tokenPx(document.body, PROPERTY.cardGap) };
}

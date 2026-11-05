import { DEFAULT_CARD_SIZE } from "../application/contracts";
import { PROPERTY } from "./design";
import { px } from "./dom";

/** A card's height and the gap between cards: the list, the stack on the timeline and every card lifted from them take these. */
export interface CardSize {
	readonly height: number;
	readonly gap: number;
}

const DEFAULT_SIZE: CardSize = DEFAULT_CARD_SIZE;

let shown: CardSize = DEFAULT_SIZE;

/** The settings' size goes on the body: the tokens built on it live there, and so do the cards lifted out of the view. */
export function showCardSize(size: CardSize): void {
	document.body.style.setProperty(PROPERTY.cardHeight, px(size.height));
	document.body.style.setProperty(PROPERTY.cardGap, px(size.gap));
	shown = { height: size.height, gap: size.gap };
}

export function clearCardSize(): void {
	document.body.style.removeProperty(PROPERTY.cardHeight);
	document.body.style.removeProperty(PROPERTY.cardGap);
	shown = DEFAULT_SIZE;
}

/** The size the cards are drawn at, kept where it is set: a gesture asks for it on every move. */
export function shownCardSize(): CardSize {
	return shown;
}

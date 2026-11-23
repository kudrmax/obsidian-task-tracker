import { DEFAULT_CARD_SIZE } from "../../../core/application/contracts";
import { PROPERTY } from "../shared/design";
import { onWindowDocument, windowDocuments } from "./windowDocuments";

/** A card's height and the gap between cards: the list, the stack on the timeline and every card lifted from them take these. */
export interface CardSize {
	readonly height: number;
	readonly gap: number;
}

const DEFAULT_SIZE: CardSize = DEFAULT_CARD_SIZE;

let shown: CardSize = DEFAULT_SIZE;
/** A size was shown and not cleared: a popout window that opens gets it too. */
let set = false;

function put(doc: Document, size: CardSize): void {
	doc.body.style.setProperty(PROPERTY.cardHeight, `${size.height}px`);
	doc.body.style.setProperty(PROPERTY.cardGap, `${size.gap}px`);
}

onWindowDocument((doc) => {
	if (set) put(doc, shown);
});

/** The settings' size goes on the body of every window: the tokens built on it live there, and so do the cards lifted out of the view. */
export function showCardSize(size: CardSize): void {
	for (const doc of windowDocuments()) put(doc, size);
	shown = { height: size.height, gap: size.gap };
	set = true;
}

export function clearCardSize(): void {
	for (const doc of windowDocuments()) {
		doc.body.style.removeProperty(PROPERTY.cardHeight);
		doc.body.style.removeProperty(PROPERTY.cardGap);
	}
	shown = DEFAULT_SIZE;
	set = false;
}


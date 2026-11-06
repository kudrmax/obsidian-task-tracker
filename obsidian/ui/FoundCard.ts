import { keyId, type TaskItem } from "../../core/application/contracts";

const FOUND = "is-found";

/** Scrolls the list or the timeline the card stands in, and nothing else, so the card shows whole. */
function scrollToShow(card: HTMLElement): void {
	const scroller = card.closest<HTMLElement>(".tc-list, .tc-timeline");
	if (!scroller) return;
	const box = scroller.getBoundingClientRect();
	const rect = card.getBoundingClientRect();
	if (rect.top < box.top) scroller.scrollTop -= box.top - rect.top;
	else if (rect.bottom > box.bottom) scroller.scrollTop += Math.min(rect.bottom - box.bottom, rect.top - box.top);
}

/**
 * The task the search led to: its card wears the selection ring in every drawing, and the first drawing after the search
 * scrolls it into sight. Any tap on the screen lets it go.
 */
export class FoundCard {
	private id: string | null = null;
	private scroll = false;
	private readonly cards = new Set<HTMLElement>();

	mark(item: TaskItem): void {
		this.clear();
		this.id = keyId(item.key);
		this.scroll = true;
	}

	/** A card drawn for `item`: it wears the ring when it is the found task's. */
	attach(card: HTMLElement, item: TaskItem): void {
		if (this.id === null || keyId(item.key) !== this.id) return;
		card.classList.add(FOUND);
		this.cards.add(card);
		if (!this.scroll) return;
		this.scroll = false;
		requestAnimationFrame(() => scrollToShow(card));
	}

	clear(): void {
		this.id = null;
		this.scroll = false;
		for (const card of this.cards) card.classList.remove(FOUND);
		this.cards.clear();
	}

	get active(): boolean {
		return this.id !== null;
	}
}

import { scrollSmoothly } from "../motion/SmoothScroll";

/** A stretch of the screen from top to bottom, in window pixels. */
export interface Band {
	readonly top: number;
	readonly bottom: number;
}

/** The part of a scrolling column that shows its content: inside its padding, so not under the fade at its foot. */
export interface ShownBox extends Band {
	readonly scroller: HTMLElement;
}

/** How far a column scrolls to show `item`: not at all when it is shown whole, wholly when it fits, else from its top. */
export function scrollToShow(item: Band, box: Band): number {
	if (item.bottom - item.top > box.bottom - box.top || item.top < box.top) return item.top - box.top;
	return Math.max(0, item.bottom - box.bottom);
}

/** What of `item` the box shows. */
export function clipTo(item: DOMRect, box: Band): DOMRect {
	const top = Math.max(item.top, box.top);
	const bottom = Math.min(item.bottom, box.bottom);
	return new DOMRect(item.left, top, item.width, Math.max(0, bottom - top));
}

/** Where a copy `height` tall stands to keep inside the box: where the item stood, pulled up only as far as it takes, never over the top. */
export function topInside(top: number, height: number, box: Band): number {
	return Math.max(box.top, Math.min(top, box.bottom - height));
}

/** The scrolling column `el` stands in; none for one that doesn't scroll, as a card in a menu's stack. */
export function shownBoxOf(el: HTMLElement): ShownBox | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		const style = getComputedStyle(node);
		if (style.overflowY !== "auto" && style.overflowY !== "scroll") continue;
		const rect = node.getBoundingClientRect();
		return { scroller: node, top: rect.top + parseFloat(style.paddingTop || "0"), bottom: rect.bottom - parseFloat(style.paddingBottom || "0") };
	}
	return null;
}

/** What of `el` its column shows, and the column's shown box; the whole of it outside a scrolling column. */
export function shownPart(el: HTMLElement): { readonly rect: DOMRect; readonly box: ShownBox | null } {
	const box = shownBoxOf(el);
	const rect = el.getBoundingClientRect();
	return { rect: box ? clipTo(rect, box) : rect, box };
}

/**
 * `el` comes into view in its column with the plugin's one smooth scroll, whole or from its top when it is taller;
 * `then` runs once the column stands still, at once when it needs no scroll. Answers how to call it off.
 */
export function scrollIntoColumn(el: HTMLElement, then: () => void): () => void {
	const box = shownBoxOf(el);
	const by = box ? scrollToShow(el.getBoundingClientRect(), box) : 0;
	if (!box || Math.abs(by) < 1) {
		then();
		return () => undefined;
	}
	let called = false;
	return scrollSmoothly(box.scroller, box.scroller.scrollTop + by, () => {
		if (called) return;
		called = true;
		then();
	});
}

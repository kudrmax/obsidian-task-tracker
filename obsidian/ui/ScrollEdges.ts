import { PROPERTY } from "./design";
import { px } from "./dom";
import { CARD_HEIGHTS } from "../../core/application/contracts";

/** Less than this past an edge counts as resting at it: a fraction of a pixel left by a zoom or a scaled screen. */
const RESTING_PX = 1;

/**
 * Which edges of a scroller have content under them (`is-under-top`, `is-under-bottom`), so the content fades out softly
 * there instead of being cut by a line, and how much is under each (`--tc-scrolled` and `--tc-scrolled-below`), so each
 * fade grows in with the scroll rather than appearing in a step. Followed on a scroll, when the scroller or its content
 * changes size, and when the owner has drawn the content anew, so the fade never lags a frame behind what it covers.
 */
export class ScrollEdges {
	private readonly sizeWatch = new ResizeObserver(() => this.update());
	private readonly scrolled = () => this.update();

	constructor(
		private readonly el: HTMLElement,
		content: HTMLElement | null = null,
	) {
		el.addEventListener("scroll", this.scrolled, { passive: true });
		this.sizeWatch.observe(el);
		if (content) this.sizeWatch.observe(content);
	}

	/** Also called by the owner once the content is drawn anew under a scroller that may not have moved. */
	update(): void {
		const below = this.el.scrollHeight - this.el.clientHeight - this.el.scrollTop;
		this.el.classList.toggle("is-under-top", this.el.scrollTop > RESTING_PX);
		this.el.classList.toggle("is-under-bottom", below > RESTING_PX);
		this.show(PROPERTY.scrolled, this.el.scrollTop);
		this.show(PROPERTY.scrolledBelow, below);
	}

	private readonly shown = new Map<string, number>();

	/** How much content is under an edge, held at the tallest card's height, which no fade passes: written only while it changes, so the scroll beyond restyles nothing. */
	private show(property: string, under: number): void {
		const depth = Math.min(Math.max(under, 0), CARD_HEIGHTS.max);
		if (this.shown.get(property) === depth) return;
		this.shown.set(property, depth);
		this.el.style.setProperty(property, px(depth));
	}

	destroy(): void {
		this.sizeWatch.disconnect();
		this.el.removeEventListener("scroll", this.scrolled);
	}
}

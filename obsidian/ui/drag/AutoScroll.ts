import { LAYOUT } from "../design";

/**
 * Pixels per frame a scroller moves for a finger at `y` against its edges `top` and `bottom`: none away from them, up to
 * `speed` within `edge` of one, faster the closer; a finger past an edge goes at full speed.
 */
export function edgeVelocity(y: number, top: number, bottom: number, edge = LAYOUT.autoScrollEdge, speed = LAYOUT.autoScrollSpeed): number {
	if (y < top + edge) return -(1 - Math.max(0, y - top) / edge) * speed;
	if (y > bottom - edge) return (1 - Math.max(0, bottom - y) / edge) * speed;
	return 0;
}

/**
 * Where what a scroller shows ends at the bottom: a list and the timeline run down under the view's foot (the switch, the
 * plus and Undo, and on the phone Obsidian's own bar under them), so their edge for scrolling is the top of the switch's row.
 */
export function shownBottom(scroller: HTMLElement, bottom: number): number {
	const foot = scroller.closest(".task-calendar")?.querySelector<HTMLElement>(":scope > .tc-seg");
	if (!foot) return bottom;
	const top = foot.getBoundingClientRect().top;
	return top > 0 && top < bottom ? top : bottom;
}

export interface Frames {
	request(fn: () => void): number;
	cancel(id: number): void;
}

const WINDOW_FRAMES: Frames = {
	request: (fn) => requestAnimationFrame(fn),
	cancel: (id) => cancelAnimationFrame(id),
};

/**
 * A scroller that scrolls itself under a dragged card held near its top or bottom edge, a frame at a time, faster the
 * closer to the edge, for as long as the finger stays there; after each step `onScrolled` previews the drop again. Only a
 * finger heading for the edge, then held there for a moment (`LAYOUT.autoScrollDwell`), scrolls: one lifting a card near
 * the edge, carried across it on to another list, or in across it back from the zones under the list, leaves it as it is.
 */
export class AutoScroll {
	private frame = 0;
	private lastY: number | null = null;
	/** Steps are being taken: a finger held still goes on scrolling, one that has not set off does not start. */
	private scrolling = false;
	/** When the finger came to the edge heading for it: it scrolls once held there long enough. */
	private arrived: number | null = null;

	constructor(
		private readonly scroller: () => HTMLElement,
		private readonly onScrolled: () => void,
		private readonly frames: Frames = WINDOW_FRAMES,
		private readonly now: () => number = () => performance.now(),
		private readonly dwellMs: number = LAYOUT.autoScrollDwell,
	) {}

	/** The finger is at `y`, the scroller's box read by the caller before it wrote anything: a step is planned near an edge it heads for, and none elsewhere. */
	follow(y: number, box: DOMRect): void {
		const el = this.scroller();
		const velocity = edgeVelocity(y, box.top, shownBottom(el, box.bottom));
		const from = this.lastY;
		this.lastY = y;
		const towards = from !== null && (y === from ? this.scrolling || this.arrived !== null : velocity > 0 === y > from);
		if (velocity === 0 || !towards) return this.halt();
		const now = this.now();
		this.arrived ??= now;
		if (!this.scrolling && now - this.arrived < this.dwellMs) {
			/** Held still, the finger sends nothing: the frame asks again until the moment has passed. */
			if (!this.frame) this.frame = this.frames.request(() => {
				this.frame = 0;
				this.onScrolled();
			});
			return;
		}
		this.scrolling = true;
		if (this.frame) return;
		this.frame = this.frames.request(() => {
			this.frame = 0;
			const before = el.scrollTop;
			el.scrollTop = before + velocity;
			if (el.scrollTop !== before) this.onScrolled();
		});
	}

	/** The finger has gone: the next one to come is not yet heading anywhere. */
	stop(): void {
		this.halt();
		this.lastY = null;
	}

	private halt(): void {
		if (this.frame) this.frames.cancel(this.frame);
		this.frame = 0;
		this.scrolling = false;
		this.arrived = null;
	}
}

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
 * closer to the edge, for as long as the finger stays there; after each step `onScrolled` previews the drop again.
 */
export class AutoScroll {
	private frame = 0;

	constructor(
		private readonly scroller: () => HTMLElement,
		private readonly onScrolled: () => void,
		private readonly frames: Frames = WINDOW_FRAMES,
	) {}

	/** The finger is at `y`: a step is planned near an edge, and none away from them. */
	follow(y: number): void {
		const el = this.scroller();
		const r = el.getBoundingClientRect();
		const velocity = edgeVelocity(y, r.top, r.bottom);
		if (velocity === 0) return this.stop();
		if (this.frame) return;
		this.frame = this.frames.request(() => {
			this.frame = 0;
			const before = el.scrollTop;
			el.scrollTop = before + velocity;
			if (el.scrollTop !== before) this.onScrolled();
		});
	}

	stop(): void {
		if (this.frame) this.frames.cancel(this.frame);
		this.frame = 0;
	}
}

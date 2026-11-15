/**
 * The scroll driver (§Architecture): every programmatic scroll. A carried card held near the top or bottom edge of the
 * block's stack scrolls it, a frame at a time, faster the closer, for as long as the finger stays there; only a finger
 * heading for the edge and held there a moment scrolls (the old screen's `AutoScroll`). After each step `scrolled`
 * reads the target under the finger again.
 */
export const EDGE = 40;
export const SPEED = 12;
export const DWELL_MS = 250;

/** Pixels a frame for a finger at `y` against the edges: none away from them, up to `SPEED` within `EDGE` of one. */
export function edgeVelocity(y: number, top: number, bottom: number): number {
	if (y < top + EDGE) return -(1 - Math.max(0, y - top) / EDGE) * SPEED;
	if (y > bottom - EDGE) return (1 - Math.max(0, bottom - y) / EDGE) * SPEED;
	return 0;
}

export class EdgeScroll {
	private frame = 0;
	private lastY: number | null = null;
	private arrived: number | null = null;
	private scrolling = false;

	constructor(
		private readonly scroller: HTMLElement,
		/** The scroller's edges and whether it can scroll at all, as `measure` reads them. */
		private readonly edges: () => { readonly top: number; readonly bottom: number; readonly scrolls: boolean },
		private readonly scrolled: () => void,
	) {}

	/** The finger is at `y` (client pixels): a step is planned near an edge it heads for, and none elsewhere. */
	follow(y: number): void {
		const view = this.scroller.ownerDocument.defaultView;
		if (!view) return;
		const box = this.edges();
		const velocity = box.scrolls ? edgeVelocity(y, box.top, box.bottom) : 0;
		const from = this.lastY;
		this.lastY = y;
		const towards = from !== null && (y === from ? this.scrolling || this.arrived !== null : velocity > 0 === y > from);
		if (velocity === 0 || !towards) return this.stop();
		const now = view.performance.now();
		this.arrived ??= now;
		if (this.frame) return;
		this.frame = view.requestAnimationFrame(() => {
			this.frame = 0;
			if (!this.scrolling && view.performance.now() - (this.arrived ?? 0) < DWELL_MS) return this.follow(y);
			this.scrolling = true;
			this.scroller.scrollTop += velocity;
			this.scrolled();
			if (this.lastY !== null) this.follow(this.lastY);
		});
	}

	stop(): void {
		this.scroller.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.arrived = null;
		this.scrolling = false;
	}
}

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
		if (this.frame) return;
		/** The dwell counts from the first frame the finger is seen heading for the edge there. */
		this.frame = view.requestAnimationFrame((now) => {
			this.frame = 0;
			this.arrived ??= now;
			if (!this.scrolling && now - this.arrived < DWELL_MS) return this.follow(y);
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

/** CSS's cubic-bezier(x1, y1, x2, y2) as the share of the way gone at a share of the time; anything else runs evenly (the old screen's `easingOf`). */
export function easingOf(css: string): (t: number) => number {
	const match = /cubic-bezier\(([^)]*)\)/.exec(css);
	const p = match?.[1].split(",").map(Number) ?? [];
	if (p.length !== 4 || !p.every(Number.isFinite)) return (t) => t;
	const [x1, y1, x2, y2] = p;
	const at = (p1: number, p2: number, s: number) => 3 * p1 * s * (1 - s) ** 2 + 3 * p2 * s ** 2 * (1 - s) + s ** 3;
	const solve = (t: number): number => {
		let low = 0;
		let high = 1;
		let s = t;
		while (high - low > 1e-6) {
			if (at(x1, x2, s) < t) low = s;
			else high = s;
			s = (low + high) / 2;
		}
		return s;
	};
	return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : at(y1, y2, solve(t)));
}

/** How long past its time a glide waits for its last frame before it stands anyway (a page out of sight draws none). */
const FRAME_SLACK_MS = 100;
/** What takes a scroller from a glide: a finger or a wheel on it. */
const FINGER = ["pointerdown", "wheel", "touchstart"] as const;

/** The scroll driver (§Architecture): every programmatic scroll, smooth as the plugin's one smooth scroll is. */
export class Scroll {
	/** `scroller` glides to `top`. */
	static glide(scroller: HTMLElement, top: number): void {
		scroller.scrollTo({ top, behavior: "smooth" });
	}

	/**
	 * `scroller` glides from `from` to `to` frame by frame in `ms` along `ease` (the old screen's `scrollSmoothly`), and
	 * `done` hears once how it ended: it got there, or a finger or a wheel took the scroller (it yields at once). Answers
	 * how to call it off, after which `done` hears nothing.
	 */
	static glideTo(scroller: HTMLElement, from: number, to: number, ms: number, ease: string, done: (how: "arrived" | "finger") => void): () => void {
		const view = scroller.ownerDocument.defaultView;
		if (!view || ms <= 0) {
			scroller.scrollTop = to;
			done("arrived");
			return () => undefined;
		}
		const curve = easingOf(ease);
		let start: number | null = null;
		let frame = 0;
		let timer = 0;
		const end = () => {
			view.cancelAnimationFrame(frame);
			view.clearTimeout(timer);
			for (const type of FINGER) scroller.removeEventListener(type, finger);
		};
		const finger = () => {
			end();
			done("finger");
		};
		const land = () => {
			end();
			scroller.scrollTop = to;
			done("arrived");
		};
		const step = (now: number) => {
			start ??= now;
			const t = Math.min(1, (now - start) / ms);
			if (t >= 1) return land();
			scroller.scrollTop = from + (to - from) * curve(t);
			frame = view.requestAnimationFrame(step);
		};
		for (const type of FINGER) scroller.addEventListener(type, finger, { passive: true });
		frame = view.requestAnimationFrame(step);
		timer = view.setTimeout(land, ms + FRAME_SLACK_MS);
		return end;
	}
}

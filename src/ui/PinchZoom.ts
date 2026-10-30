import { capturePointer } from "./dom";
import type { GestureArbiter } from "./gestures";

export interface ZoomAnchor {
	/** The minute under the fingers' midpoint, which stays put while the scale changes. */
	readonly minutes: number;
	readonly clientY: number;
}

export interface PinchZoomOptions {
	hourPx(): number;
	/** The bounds follow the screen's height: the whole day is the farthest a pinch goes out. */
	min(): number;
	max(): number;
	arbiter: GestureArbiter;
	minutesAt(clientY: number): number;
	onScale(hourPx: number, anchor: ZoomAnchor): void;
	/** The fingers lifted (or the wheel stopped): time to settle on a level. */
	onRelease(hourPx: number, anchor: ZoomAnchor): void;
}

const PINCH = "pinch";
const WHEEL_SETTLE_MS = 150;
/** One wheel notch of a hundred units doubles or halves the hour. */
const WHEEL_UNITS_PER_DOUBLING = 100;

/**
 * Two fingers scale the hour; a computer uses ctrl or cmd with the wheel. The minute between the fingers stays where it is.
 * iOS sends a finger's lift to the element it touched, and a redraw may have taken that element away: a finger that comes
 * down alone proves the others gone, and a pinch holds its fingers on the timeline itself.
 */
export class PinchZoom {
	private readonly pointers = new Map<number, { x: number; y: number }>();
	private pinch: { readonly distance: number; readonly hourPx: number; readonly anchor: ZoomAnchor } | null = null;
	private wheelTimer: number | null = null;
	private lastAnchor: ZoomAnchor | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly opts: PinchZoomOptions,
	) {
		el.addEventListener("pointerdown", (e) => this.down(e));
		el.addEventListener("pointermove", (e) => this.move(e));
		el.addEventListener("pointerup", (e) => this.up(e));
		el.addEventListener("pointercancel", (e) => this.up(e));
		el.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
	}

	get active(): boolean {
		return this.pinch !== null;
	}

	private clamp(hourPx: number): number {
		return Math.min(this.opts.max(), Math.max(this.opts.min(), hourPx));
	}

	private geometry(): { distance: number; midY: number } {
		const [a, b] = [...this.pointers.values()];
		return { distance: Math.hypot(a.x - b.x, a.y - b.y), midY: (a.y + b.y) / 2 };
	}

	private down(e: PointerEvent): void {
		if (e.pointerType === "mouse") return;
		if (e.isPrimary) this.end();
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.pointers.size !== 2 || this.pinch || !this.opts.arbiter.claim(PINCH)) return;
		const { distance, midY } = this.geometry();
		this.pinch = { distance: Math.max(distance, 1), hourPx: this.opts.hourPx(), anchor: { minutes: this.opts.minutesAt(midY), clientY: midY } };
		for (const id of this.pointers.keys()) capturePointer(this.el, id);
	}

	private move(e: PointerEvent): void {
		if (!this.pointers.has(e.pointerId)) return;
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (!this.pinch || this.pointers.size < 2) return;
		const { distance } = this.geometry();
		this.opts.onScale(this.clamp((this.pinch.hourPx * distance) / this.pinch.distance), this.pinch.anchor);
	}

	private up(e: PointerEvent): void {
		if (!this.pointers.delete(e.pointerId)) return;
		if (!this.pinch || this.pointers.size >= 2) return;
		this.end();
	}

	private end(): void {
		this.pointers.clear();
		if (!this.pinch) return;
		const anchor = this.pinch.anchor;
		this.pinch = null;
		this.opts.arbiter.release(PINCH);
		this.opts.onRelease(this.opts.hourPx(), anchor);
	}

	private wheel(e: WheelEvent): void {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const anchor = this.lastAnchor ?? { minutes: this.opts.minutesAt(e.clientY), clientY: e.clientY };
		this.lastAnchor = anchor;
		this.opts.onScale(this.clamp(this.opts.hourPx() * Math.pow(2, -e.deltaY / WHEEL_UNITS_PER_DOUBLING)), anchor);
		if (this.wheelTimer !== null) window.clearTimeout(this.wheelTimer);
		this.wheelTimer = window.setTimeout(() => {
			this.wheelTimer = null;
			this.lastAnchor = null;
			this.opts.onRelease(this.opts.hourPx(), anchor);
		}, WHEEL_SETTLE_MS);
	}
}

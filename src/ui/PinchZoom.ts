import { capturePointer } from "./dom";
import type { GestureArbiter } from "./gestures";

export interface ZoomAnchor {
	/** The minute under the fingers' midpoint, which stays put while the scale changes. */
	readonly minutes: number;
	readonly clientY: number;
}

export interface PinchZoomOptions {
	hourPx(): number;
	/** The bounds follow the screen's height: the whole day is the farthest a pinch goes out. Read once a gesture. */
	bounds(): { readonly min: number; readonly max: number };
	arbiter: GestureArbiter;
	minutesAt(clientY: number): number;
	onScale(hourPx: number, anchor: ZoomAnchor): void;
	/** The fingers lifted (or the wheel stopped): the scale stays where it is. */
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
	/** The scale last asked for: the view lays it out on the next frame, so its own hour may still be the one before. */
	private scaled: number | null = null;
	/** The bounds of the gesture under way, taken as it began. */
	private limits: { readonly min: number; readonly max: number } | null = null;

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
		const limits = (this.limits ??= this.opts.bounds());
		return Math.min(limits.max, Math.max(limits.min, hourPx));
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
		this.limits = this.opts.bounds();
		for (const id of this.pointers.keys()) capturePointer(this.el, id);
	}

	private move(e: PointerEvent): void {
		if (!this.pointers.has(e.pointerId)) return;
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (!this.pinch || this.pointers.size < 2) return;
		const { distance } = this.geometry();
		this.scale((this.pinch.hourPx * distance) / this.pinch.distance, this.pinch.anchor);
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
		this.limits = null;
		this.opts.arbiter.release(PINCH);
		this.release(anchor);
	}

	private scale(hourPx: number, anchor: ZoomAnchor): void {
		this.scaled = this.clamp(hourPx);
		this.opts.onScale(this.scaled, anchor);
	}

	private release(anchor: ZoomAnchor): void {
		this.opts.onRelease(this.scaled ?? this.opts.hourPx(), anchor);
		this.scaled = null;
	}

	private wheel(e: WheelEvent): void {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		if (this.lastAnchor === null) this.limits = this.opts.bounds();
		const anchor = this.lastAnchor ?? { minutes: this.opts.minutesAt(e.clientY), clientY: e.clientY };
		this.lastAnchor = anchor;
		this.scale((this.scaled ?? this.opts.hourPx()) * Math.pow(2, -e.deltaY / WHEEL_UNITS_PER_DOUBLING), anchor);
		if (this.wheelTimer !== null) window.clearTimeout(this.wheelTimer);
		this.wheelTimer = window.setTimeout(() => {
			this.wheelTimer = null;
			this.lastAnchor = null;
			this.limits = null;
			this.release(anchor);
		}, WHEEL_SETTLE_MS);
	}
}

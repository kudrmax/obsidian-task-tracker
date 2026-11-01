import { LAYOUT } from "./design";
import { capturePointer, releasePointer } from "./dom";
import type { GestureArbiter } from "./gestures";
import { PointerSpeed } from "./PointerSpeed";
import type { Shift } from "./screens";

export interface SwipeOptions {
	readonly arbiter: GestureArbiter;
	/** Whether a press here may swipe: what lies over the screen keeps its fingers. */
	accepts(target: EventTarget | null): boolean;
	onSwipe(shift: Shift): void;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	readonly y: number;
	readonly speed: PointerSpeed;
	swiping: boolean;
}

/**
 * What a trackpad sends without a pause: one stroke, its glide after the fingers lift, and any stroke begun while it
 * glides. It steps once the fingers have swept far enough lately; then it waits for the next stroke.
 */
interface Stream {
	/** The sideways moves of the last moments, while it may step. */
	recent: { readonly time: number; readonly delta: number }[];
	/** Where and when it stepped: the glide that follows runs the same way and only slows down. */
	stepped: { readonly time: number; readonly shift: Shift } | null;
	/** The size of the last move. */
	last: number;
	timer: number;
}

const SWIPE = "swipe";
/** The stream ends once the trackpad has sent nothing for this long. */
const STREAM_SETTLE_MS = 150;
/** The fingers sweep: only the moves of this long count towards a step, so a slow creep never makes one. */
const SWEEP_MS = 100;
/** Fingers come down again no sooner than this after a step; until then the stroke that stepped is still going. */
const NEXT_STROKE_MS = 150;
/** A glide only slows down: a move this many times the last one is fingers that came down and swept again. */
const NEXT_STROKE_RISE = 1.5;

/**
 * A finger drawn sideways across the screen steps to the next screen, to the left, or back, to the right; up or down it is
 * a scroll and stays one. It holds the screen once it goes sideways, so a press that set off as a swipe is not also
 * lifted, scrolled or pulled, and it steps when let go far enough along, or quickly. Two fingers drawn sideways on a
 * trackpad step the same way, once a stroke, however soon the next stroke follows; a pinch (ctrl or cmd with the wheel)
 * is the zoom's.
 */
export class Swipe {
	private press: Press | null = null;
	private stream: Stream | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly opts: SwipeOptions,
	) {
		el.addEventListener("pointerdown", (e) => this.down(e));
		el.addEventListener("pointermove", (e) => this.move(e));
		el.addEventListener("pointerup", (e) => this.up(e, true));
		el.addEventListener("pointercancel", (e) => this.up(e, false));
		el.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
	}

	private wheel(e: WheelEvent): void {
		if (e.ctrlKey || e.metaKey || this.opts.arbiter.busy || !this.opts.accepts(e.target)) return;
		const stream = (this.stream ??= { recent: [], stepped: null, last: 0, timer: 0 });
		window.clearTimeout(stream.timer);
		stream.timer = window.setTimeout(() => (this.stream = null), STREAM_SETTLE_MS);
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
		e.preventDefault();
		const size = Math.abs(e.deltaX);
		if (stream.stepped && this.nextStroke(stream.stepped, e, stream.last)) stream.stepped = null;
		stream.last = size;
		if (stream.stepped) return;
		stream.recent = [...stream.recent.filter((move) => e.timeStamp - move.time < SWEEP_MS), { time: e.timeStamp, delta: e.deltaX }];
		const travel = stream.recent.reduce((sum, move) => sum + move.delta, 0);
		if (Math.abs(travel) < LAYOUT.swipeWheelDistance) return;
		const shift: Shift = travel > 0 ? 1 : -1;
		stream.stepped = { time: e.timeStamp, shift };
		stream.recent = [];
		this.opts.onSwipe(shift);
	}

	/** After a step the glide runs the same way and slows down; a move the other way, or a sudden rise, is the next stroke. */
	private nextStroke(stepped: { readonly time: number; readonly shift: Shift }, e: WheelEvent, last: number): boolean {
		if (e.timeStamp - stepped.time < NEXT_STROKE_MS) return false;
		return Math.sign(e.deltaX) !== stepped.shift || Math.abs(e.deltaX) > last * NEXT_STROKE_RISE + 1;
	}

	private down(e: PointerEvent): void {
		if (e.pointerType === "mouse") return;
		if (!e.isPrimary) {
			if (this.press && !this.press.swiping) this.press = null;
			return;
		}
		if (this.opts.arbiter.busy || !this.opts.accepts(e.target)) return;
		this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, speed: new PointerSpeed(e.clientX, e.timeStamp), swiping: false };
	}

	private move(e: PointerEvent): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		press.speed.update(e.clientX, e.timeStamp);
		if (press.swiping) return;
		const dx = Math.abs(e.clientX - press.x);
		const dy = Math.abs(e.clientY - press.y);
		if (Math.hypot(dx, dy) <= LAYOUT.pressTolerance) return;
		if (dx <= dy || !this.opts.arbiter.claim(SWIPE)) {
			this.press = null;
			return;
		}
		press.swiping = true;
		capturePointer(this.el, press.pointerId);
	}

	private up(e: PointerEvent, released: boolean): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		this.press = null;
		if (!press.swiping) return;
		press.speed.update(e.clientX, e.timeStamp);
		releasePointer(this.el, press.pointerId);
		this.opts.arbiter.release(SWIPE);
		const dx = e.clientX - press.x;
		const far = Math.abs(dx) >= LAYOUT.swipeDistance;
		const quick = Math.abs(dx) > LAYOUT.pressTolerance && press.speed.value >= LAYOUT.swipeFlickSpeed;
		if (released && (far || quick)) this.opts.onSwipe(dx < 0 ? 1 : -1);
	}
}

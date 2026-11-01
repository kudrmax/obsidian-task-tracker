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

/** A trackpad's stroke, its glide after the fingers lift included: it steps once. */
interface Stroke {
	travel: number;
	stepped: boolean;
	timer: number;
}

const SWIPE = "swipe";
/** A stroke ends once the trackpad has sent nothing for this long. */
const STROKE_SETTLE_MS = 150;

/**
 * A finger drawn sideways across the screen steps to the next screen, to the left, or back, to the right; up or down it is
 * a scroll and stays one. It holds the screen once it goes sideways, so a press that set off as a swipe is not also
 * lifted, scrolled or pulled, and it steps when let go far enough along, or quickly. Two fingers drawn sideways on a
 * trackpad step the same way, once a stroke; a pinch (ctrl or cmd with the wheel) is the zoom's.
 */
export class Swipe {
	private press: Press | null = null;
	private stroke: Stroke | null = null;

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
		const stroke = (this.stroke ??= { travel: 0, stepped: false, timer: 0 });
		window.clearTimeout(stroke.timer);
		stroke.timer = window.setTimeout(() => (this.stroke = null), STROKE_SETTLE_MS);
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
		e.preventDefault();
		if (stroke.stepped) return;
		stroke.travel += e.deltaX;
		if (Math.abs(stroke.travel) < LAYOUT.swipeWheelDistance) return;
		stroke.stepped = true;
		this.opts.onSwipe(stroke.travel > 0 ? 1 : -1);
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

import { LAYOUT } from "./design";
import { capturePointer, releasePointer } from "./dom";
import type { GestureArbiter } from "./gestures";
import { PointerSpeed } from "./PointerSpeed";
import type { Shift } from "./screens";

/** What a swipe draws: the screen, beside the next one either way. */
export interface SwipeTarget {
	/** How far the screen travels to stand on the next one `shift`'s way; null where the row of screens ends. */
	distance(shift: Shift): number | null;
	/** The screen drawn `dx` px from where it stood, left negative. */
	follow(dx: number): void;
	/** Let go: on to the next screen `shift`'s way, or back where it stood (null); resolves once it stands. */
	settle(shift: Shift | null): Promise<void>;
	/** It stands at once where it was going. */
	stand(): void;
}

export interface SwipeOptions {
	readonly arbiter: GestureArbiter;
	/** Whether a press here may swipe: what lies over the screen keeps its fingers. */
	accepts(target: EventTarget | null): boolean;
	readonly target: SwipeTarget;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	readonly y: number;
	readonly speed: PointerSpeed;
	/** Where the finger stood when the screen took it: the screen follows it from there. */
	from: number;
	swiping: boolean;
}

/**
 * What a trackpad sends without a pause: one stroke, its glide after the fingers lift, and any stroke begun while it
 * glides. The screen follows the fingers and is let go the moment they are: when they sweep, when the glide sets in, or
 * when they have drawn it the whole way; the glide that follows is passed by.
 */
interface Stream {
	/** How far the stroke has drawn the screen. */
	dx: number;
	/** Whether the screen follows the stroke now. */
	following: boolean;
	/** Where and when the screen was let go: the glide that follows runs the same way and only slows down. */
	stepped: { readonly time: number; readonly shift: Shift } | null;
	/** The sideways moves of the last moments. */
	recent: { readonly time: number; readonly delta: number }[];
	/** The size of the last move. */
	last: number;
	/** How many times in a row the moves have shrunk, with none growing: the glide after the fingers lift only shrinks. */
	shrinking: number;
	timer: number;
}

/**
 * A field being typed in and the bar beside it, and the field of a section's name: a finger there edits, it does not
 * swipe. Nor on the divider that sets the columns' widths: a finger there resizes.
 */
const NOT_SWIPED = ".tc-quick-row, .tc-quick-bar, .tc-group-field, .tc-divider:not(.is-fixed)";

/** Whether a swipe of the screen may start at `target`: anywhere but where text is being typed or the columns resized. */
export function swipeStartsAt(target: EventTarget | null): boolean {
	return !(target instanceof Element && target.closest(NOT_SWIPED));
}

const SWIPE = "swipe";
/** The stream ends once the trackpad has sent nothing for this long: the fingers stopped, or lifted and the glide died. */
const STREAM_SETTLE_MS = 150;
/** The fingers sweep: only the moves of this long count towards a sweep, so a slow creep never makes one. */
const SWEEP_MS = 100;
/** Moves that shrink this many times in a row, none growing, are the glide: the fingers have lifted. */
const GLIDE_SHRINKS = 4;
/** Fingers come down again no sooner than this after a step; until then the stroke that stepped is still going. */
const NEXT_STROKE_MS = 150;
/** A glide only slows down: a move this many times the last one is fingers that came down and swept again. */
const NEXT_STROKE_RISE = 1.5;

/**
 * A finger drawn sideways draws the screen with it, the next screen coming in beside it, to the left or back to the right;
 * up or down it is a scroll and stays one. Let go, the screen runs on to whichever screen stands nearer, or the way a quick
 * flick sends it, never further than the next one. It holds the screen from the moment it goes sideways until the screen
 * stands again, so a press that set off as a swipe is not also lifted or scrolled. Two fingers drawn sideways on a trackpad
 * draw it the same way, and it settles once they stop; a pinch (ctrl or cmd with the wheel) is the zoom's.
 */
export class Swipe {
	private press: Press | null = null;
	private stream: Stream | null = null;
	/** The swipes and settlings now holding the screen. */
	private holds = 0;
	/** Counts the times the screen was made to stand at once: a settling begun before that no longer holds it. */
	private round = 0;

	constructor(
		private readonly el: HTMLElement,
		private readonly opts: SwipeOptions,
	) {
		el.addEventListener("pointerdown", () => this.interrupt(), { capture: true });
		el.addEventListener("pointerdown", (e) => this.down(e));
		el.addEventListener("pointermove", (e) => this.move(e));
		el.addEventListener("pointerup", (e) => this.up(e, true));
		el.addEventListener("pointercancel", (e) => this.up(e, false));
		el.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
	}

	private wheel(e: WheelEvent): void {
		if (e.ctrlKey || e.metaKey || !this.free() || !this.opts.accepts(e.target)) return;
		const stream = (this.stream ??= { dx: 0, following: false, stepped: null, recent: [], last: 0, shrinking: 0, timer: 0 });
		window.clearTimeout(stream.timer);
		stream.timer = window.setTimeout(() => this.endStream(stream), STREAM_SETTLE_MS);
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
		e.preventDefault();
		const size = Math.abs(e.deltaX);
		if (stream.stepped && this.nextStroke(stream.stepped, e, stream.last)) stream.stepped = null;
		stream.shrinking = size < stream.last ? stream.shrinking + 1 : size > stream.last ? 0 : stream.shrinking;
		stream.last = size;
		if (stream.stepped) return;
		if (!stream.following) {
			if (!this.hold()) return;
			stream.following = true;
			stream.dx = 0;
			stream.recent = [];
			stream.shrinking = 0;
		}
		stream.dx = this.within(stream.dx - e.deltaX);
		this.opts.target.follow(stream.dx);
		stream.recent = [...stream.recent.filter((move) => e.timeStamp - move.time < SWEEP_MS), { time: e.timeStamp, delta: e.deltaX }];
		const sweep = stream.recent.reduce((sum, move) => sum + move.delta, 0);
		const going: Shift = e.deltaX > 0 ? 1 : -1;
		if (Math.abs(sweep) >= LAYOUT.swipeWheelDistance) return this.stepStream(stream, e, sweep > 0 ? 1 : -1, sweep > 0 ? 1 : -1);
		const shift: Shift = stream.dx < 0 ? 1 : -1;
		const distance = this.opts.target.distance(shift);
		if (distance !== null && Math.abs(stream.dx) >= distance) return this.stepStream(stream, e, going, shift);
		if (stream.shrinking < GLIDE_SHRINKS) return;
		const span = Math.max(1, e.timeStamp - stream.recent[0].time);
		const fling = Math.abs(sweep) / span >= LAYOUT.swipeFlickSpeed ? going : 0;
		this.stepStream(stream, e, going, this.landing(stream.dx, fling));
	}

	/** The screen is let go: on to `shift`'s screen or back; the glide that follows, going `going`'s way, is passed by. */
	private stepStream(stream: Stream, e: WheelEvent, going: Shift, shift: Shift | null): void {
		stream.stepped = { time: e.timeStamp, shift: going };
		this.letStreamGo(stream, shift === null || this.opts.target.distance(shift) === null ? null : shift);
	}

	/** After a step the glide runs the same way and slows down; a move the other way, or a sudden rise, is the next stroke. */
	private nextStroke(stepped: { readonly time: number; readonly shift: Shift }, e: WheelEvent, last: number): boolean {
		if (e.timeStamp - stepped.time < NEXT_STROKE_MS) return false;
		return Math.sign(e.deltaX) !== stepped.shift || Math.abs(e.deltaX) > last * NEXT_STROKE_RISE + 1;
	}

	private endStream(stream: Stream): void {
		if (this.stream === stream) this.stream = null;
		if (stream.following) this.letStreamGo(stream, this.landing(stream.dx, 0));
	}

	private letStreamGo(stream: Stream, shift: Shift | null): void {
		stream.following = false;
		stream.dx = 0;
		this.settle(shift);
	}

	private down(e: PointerEvent): void {
		if (e.pointerType === "mouse") return;
		if (!e.isPrimary) {
			if (this.press && !this.press.swiping) this.press = null;
			return;
		}
		if (!this.free() || !this.opts.accepts(e.target)) return;
		this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, speed: new PointerSpeed(e.clientX, e.timeStamp), from: e.clientX, swiping: false };
	}

	private move(e: PointerEvent): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		press.speed.update(e.clientX, e.timeStamp);
		if (press.swiping) {
			this.opts.target.follow(this.within(e.clientX - press.from));
			return;
		}
		const dx = Math.abs(e.clientX - press.x);
		const dy = Math.abs(e.clientY - press.y);
		if (Math.hypot(dx, dy) <= LAYOUT.pressTolerance) return;
		if (dx <= dy || !this.hold()) {
			this.press = null;
			return;
		}
		press.swiping = true;
		press.from = e.clientX;
		capturePointer(this.el, press.pointerId);
	}

	private up(e: PointerEvent, released: boolean): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		this.press = null;
		if (!press.swiping) return;
		press.speed.update(e.clientX, e.timeStamp);
		releasePointer(this.el, press.pointerId);
		const dx = this.within(e.clientX - press.from);
		this.opts.target.follow(dx);
		const velocity = press.speed.velocity;
		const fling: Shift | 0 = Math.abs(velocity) < LAYOUT.swipeFlickSpeed ? 0 : velocity < 0 ? 1 : -1;
		this.settle(released ? this.landing(dx, fling) : null);
	}

	/** Where the screen stands once let go: the next screen when it is the nearer one, or when a flick sends it there. */
	private landing(dx: number, fling: Shift | 0): Shift | null {
		if (dx === 0) return null;
		const shift: Shift = dx < 0 ? 1 : -1;
		const distance = this.opts.target.distance(shift);
		if (distance === null) return null;
		if (fling !== 0) return fling === shift ? shift : null;
		return Math.abs(dx) * 2 >= distance ? shift : null;
	}

	/** The screen goes no further than the next one; a finger that has gone neither way yet asks for no screen. */
	private within(dx: number): number {
		if (dx === 0) return 0;
		const distance = this.opts.target.distance(dx < 0 ? 1 : -1);
		return distance === null ? dx : Math.sign(dx) * Math.min(Math.abs(dx), distance);
	}

	/** The screen is free for a swipe: no other gesture holds it, though a swipe still settling may. */
	private free(): boolean {
		return this.holds > 0 || !this.opts.arbiter.busy;
	}

	private hold(): boolean {
		if (this.holds === 0 && !this.opts.arbiter.claim(SWIPE)) return false;
		this.holds++;
		return true;
	}

	private settle(shift: Shift | null): void {
		const round = this.round;
		void this.opts.target.settle(shift).then(() => {
			if (round === this.round) this.letGo();
		});
	}

	/**
	 * A finger that comes down while the screen still runs to its place stands it there at once and frees the screen
	 * before anything under the finger asks for it: the divider, a card.
	 */
	private interrupt(): void {
		if (this.holds === 0 || this.press?.swiping || this.stream?.following) return;
		this.opts.target.stand();
		this.round++;
		this.holds = 0;
		this.opts.arbiter.release(SWIPE);
	}

	private letGo(): void {
		if (--this.holds === 0) this.opts.arbiter.release(SWIPE);
	}
}

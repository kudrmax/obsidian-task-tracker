import { swipeStep } from "./swipeStep";

/** A finger let go at least this fast, px/ms, goes one place its way, however little of the way it drew (the core's `SWIPE_FLICK_SPEED`). */
export const FLICK_SPEED = 0.3;

/**
 * The ribbon as a gallery of places (Max, 2026-11-19: «как фотки в галерее»), the same for a finger on glass and two on
 * the trackpad: the columns follow the fingers, never further than one place either way of the place the stroke began
 * at, and let go they land on the nearest place or one on by the swipe's speed, never two. A stroke that
 * begins while the columns are still landing takes them from where they stand, its own place being the one they were
 * landing on; so two quick swipes the same way go two places, one each. Positions are in places from the first (0).
 */
export class FollowPager {
	/** The place the columns stand at, or are landing on. */
	stop: number;
	private origin: number | null = null;
	/** The last stroke's own place, for the same stroke going on. */
	private before: number | null = null;
	private base = 0;
	private moved = 0;

	private readonly last: number;

	constructor(stop: number, last: number) {
		this.stop = stop;
		this.last = last;
	}

	get following(): boolean {
		return this.origin !== null;
	}

	/** A stroke begins with the columns at `at`; `fresh` false: the same stroke going on after a lift that was not one. */
	begin(at: number, fresh: boolean): void {
		this.origin = fresh ? this.stop : (this.origin ?? this.before ?? this.stop);
		this.stop = this.origin;
		this.moved = 0;
		this.base = at;
	}

	/** The fingers moved `px` (positive: on); where the columns stand now, `width` px a place. */
	move(px: number, width: number): number {
		this.moved += px;
		return this.bounded(this.base + (width > 0 ? this.moved / width : 0));
	}

	/** The fingers let go with the columns at `at` and `speed` px/ms (positive: on): the place they land on. */
	release(at: number, speed: number, width: number): number {
		if (this.origin === null) return this.stop;
		/** A flick the way this stroke drew goes one place that way, one against it springs back (the core's `swipeLanding`); slower, the nearest place. */
		const drawn = Math.sign(this.moved);
		const flick = Math.abs(speed) >= FLICK_SPEED ? Math.sign(speed) : 0;
		const step = flick !== 0 ? (flick === drawn ? flick : 0) : swipeStep((at - this.stop) * width, width, 0);
		this.stop = Math.min(this.last, Math.max(0, this.origin - 1, Math.min(this.origin + 1, this.stop + step)));
		this.before = this.origin;
		this.origin = null;
		return this.stop;
	}

	private bounded(at: number): number {
		const origin = this.origin ?? this.stop;
		return Math.min(this.last, origin + 1, Math.max(0, origin - 1, at));
	}
}

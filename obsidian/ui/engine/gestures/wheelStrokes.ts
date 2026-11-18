/** A wheel event as the pager reads it: its deltas, when it came (ms), and whether it is a pinch (ctrl). */
export interface WheelSample {
	readonly dx: number;
	readonly dy: number;
	readonly t: number;
	readonly ctrl?: boolean;
}

/**
 * The pager reads the fingers by time, never by counting events: the browser hands the page one wheel event per frame
 * with the deltas of the trackpad's events in it summed (two at 60 Hz, for the trackpad's 120 a second, more on a busy
 * page). Each event's delta is spread evenly over the time since the one before (`SPREAD_MAX_MS` at most; a gesture's
 * first over `FIRST_EVENT_MS`, the trackpad's own interval), and the rule is decided at the end of each 60 Hz frame
 * (`FRAME_MS`): a merged event then reads as the events it merged.
 */
const FRAME_MS = 1000 / 60;
const FIRST_EVENT_MS = 1000 / 120;
const SPREAD_MAX_MS = 34;

/** A stroke counts once the fingers have moved this far within `STROKE_WINDOW_MS`: a brush of resting fingers is not a swipe. */
const MIN_STROKE_PX = 12;
const STROKE_WINDOW_MS = 80;
/** No hand begins two strokes the same way this close: a dip and rise inside one push is the same stroke. */
const MIN_STROKE_INTERVAL_MS = 110;
/** Quiet this long ends a gesture: the next delta begins a new one. */
const GESTURE_GAP_MS = 200;
/** The fingers' speed the rule compares: over the last `END_MS` against the `MIDDLE_MS` before them. */
const END_MS = 58;
const MIDDLE_MS = 400;
/**
 * Pushing: the last speed rises this far above the one before, and by `MIN_RISE` px/ms at least (a slow push's wobble of
 * a pixel or two is not a new push); the tail decays under `REARM` before the next push counts.
 */
const RISE = 1.15;
const MIN_RISE = 0.1;
const REARM = 0.9;

/** A stretch of the fingers' movement: `rate` px/ms from `from` to `to`. */
interface Stretch {
	readonly from: number;
	readonly to: number;
	readonly rate: number;
}

/**
 * The Mac trackpad as a pager (stage 0, round six; fullPage.js's acceleration rule): each new stroke of the fingers turns
 * the ribbon one place its way at the stroke's start; the momentum tail, anything vertical and a pinch turn nothing. A
 * stroke starts where the fingers' speed over the last moment rises above their speed over the stretch before it (the
 * fingers push again), after the tail has decayed, after a pause, or the other way. `feed` answers -1 or 1 at a new
 * stroke's start, 0 otherwise.
 */
export class WheelStrokes {
	private stretches: Stretch[] = [];
	private start = 0;
	private last = -Infinity;
	private dir: -1 | 1 = 1;
	private armed = true;
	private fired = -Infinity;

	feed(e: WheelSample): -1 | 0 | 1 {
		if (e.ctrl || Math.abs(e.dx) <= Math.abs(e.dy)) return 0;
		const dir = Math.sign(e.dx) as -1 | 1;
		let from: number;
		if (e.t - this.last > GESTURE_GAP_MS || dir !== this.dir) {
			from = e.t - FIRST_EVENT_MS;
			this.stretches = [];
			this.start = from;
			this.armed = true;
		} else from = Math.max(this.last, e.t - SPREAD_MAX_MS);
		const since = Math.max(from, this.last);
		this.last = e.t;
		this.dir = dir;
		this.stretches = [...this.stretches.filter((s) => s.to > e.t - END_MS - MIDDLE_MS - STROKE_WINDOW_MS), { from, to: e.t, rate: Math.abs(e.dx) / (e.t - from) }];
		let step: -1 | 0 | 1 = 0;
		for (let frame = Math.floor(since / FRAME_MS) + 1; frame * FRAME_MS <= e.t; frame++) if (this.strokeStartsAt(frame * FRAME_MS)) step = dir;
		return step;
	}

	/** Whether a new stroke starts at the end of the frame ending at `t`. */
	private strokeStartsAt(t: number): boolean {
		const end = this.speed(t - END_MS, t);
		const middle = this.speed(t - END_MS - MIDDLE_MS, t - END_MS);
		if (!this.armed && end < middle * REARM) this.armed = true;
		if (!this.armed) return false;
		/** The gesture's first push: no speed before it to rise above. */
		const first = t - this.start <= END_MS;
		const pushing = first || (end >= middle * RISE && end - middle >= MIN_RISE);
		if (!pushing || this.moved(t - STROKE_WINDOW_MS, t) < MIN_STROKE_PX) return false;
		this.armed = false;
		if (t - this.fired < MIN_STROKE_INTERVAL_MS && !first) return false;
		this.fired = t;
		return true;
	}

	/** How far the fingers moved between `a` and `b`, in px. */
	private moved(a: number, b: number): number {
		return this.stretches.reduce((sum, s) => sum + s.rate * Math.max(0, Math.min(b, s.to) - Math.max(a, s.from)), 0);
	}

	/** The fingers' mean speed between `a` and `b` within this gesture, in px/ms; 0 before it began. */
	private speed(a: number, b: number): number {
		const from = Math.max(a, this.start);
		return b > from ? this.moved(from, b) / (b - from) : 0;
	}
}

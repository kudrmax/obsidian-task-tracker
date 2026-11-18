/** A wheel event as the pager reads it: its deltas, when it came (ms), and whether it is a pinch (ctrl). */
export interface WheelSample {
	readonly dx: number;
	readonly dy: number;
	readonly t: number;
	readonly ctrl?: boolean;
}

/** A stroke counts once the fingers have moved this far within `STROKE_WINDOW_MS`: a brush of resting fingers is not a swipe. */
const MIN_STROKE_PX = 12;
const STROKE_WINDOW_MS = 80;
/** No hand begins two strokes the same way this close: a dip and rise inside one push is the same stroke. */
const MIN_STROKE_INTERVAL_MS = 110;
/** Quiet this long ends a gesture: the next delta begins a new one. */
const GESTURE_GAP_MS = 200;
/** The deltas the rule compares: the last few against the many before them, and how many are kept at most. */
const END_DELTAS = 3;
const MIDDLE_DELTAS = 70;
const KEPT_DELTAS = 150;
/** Pushing: the last deltas rise this far above the ones before; the tail decays under `REARM` before the next push counts. */
const RISE = 1.3;
const REARM = 0.85;

const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);

/**
 * The Mac trackpad as a pager (stage 0, round six; fullPage.js's acceleration rule): each new stroke of the fingers turns
 * the ribbon one place its way at the stroke's start; the momentum tail, anything vertical and a pinch turn nothing. A
 * stroke starts where the average of the last few horizontal deltas rises above the average of the many before them
 * (the fingers push again), after the tail has decayed, after a pause, or the other way. `feed` answers -1 or 1 at a new
 * stroke's start, 0 otherwise.
 */
export class WheelStrokes {
	private deltas: number[] = [];
	private last = -Infinity;
	private dir = 0;
	private armed = true;
	private recent: { readonly t: number; readonly d: number }[] = [];
	private fired = -Infinity;

	feed(e: WheelSample): -1 | 0 | 1 {
		if (e.ctrl || Math.abs(e.dx) <= Math.abs(e.dy)) return 0;
		const dir = Math.sign(e.dx) as -1 | 1;
		if (e.t - this.last > GESTURE_GAP_MS || dir !== this.dir) {
			this.deltas = [];
			this.recent = [];
			this.armed = true;
		}
		this.last = e.t;
		this.dir = dir;
		this.recent = [...this.recent.filter((r) => e.t - r.t < STROKE_WINDOW_MS), { t: e.t, d: Math.abs(e.dx) }];
		this.deltas.push(Math.abs(e.dx));
		if (this.deltas.length > KEPT_DELTAS) this.deltas.shift();
		const end = mean(this.deltas.slice(-END_DELTAS));
		const middle = mean(this.deltas.slice(-END_DELTAS - MIDDLE_DELTAS, -END_DELTAS));
		if (!this.armed && end < middle * REARM) this.armed = true;
		if (!this.armed) return 0;
		const pushing = this.deltas.length <= END_DELTAS || end >= middle * RISE;
		if (!pushing) return 0;
		if (this.recent.reduce((sum, r) => sum + r.d, 0) < MIN_STROKE_PX) return 0;
		this.armed = false;
		if (e.t - this.fired < MIN_STROKE_INTERVAL_MS && this.deltas.length > END_DELTAS) return 0;
		this.fired = e.t;
		return dir;
	}
}

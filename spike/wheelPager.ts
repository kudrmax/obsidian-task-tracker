import { Lethargy } from "lethargy";

/** A wheel event as the pager reads it: its deltas and when it came, ms. */
export interface WheelSample {
	readonly dx: number;
	readonly dy: number;
	readonly t: number;
	readonly ctrl?: boolean;
}

/**
 * The trackpad as a discrete pager (fullPage.js's way): each new stroke of the fingers turns the ribbon one place its way,
 * at the stroke's start; the OS's momentum tail, and anything vertical or pinched, turns nothing. `feed` answers -1/1 at a
 * new stroke's start, 0 otherwise. Two ways to tell a new stroke from the tail are kept to compare them on recordings.
 */
export interface StrokeDetector {
	feed(e: WheelSample): -1 | 0 | 1;
}

/** A stroke counts once the fingers have moved this far within `MIN_STROKE_MS`: a brush or a drift of the resting fingers is not a swipe. */
const MIN_STROKE_PX = 12;
const MIN_STROKE_MS = 80;
/** No hand begins two strokes the same way this close: a dip and rise inside one push is the same stroke. */
const MIN_STROKE_INTERVAL_MS = 110;
/** Quiet this long ends a gesture: the next delta begins a new one. */
const GESTURE_GAP_MS = 200;

/**
 * fullPage.js's rule: the fingers are pushing while the average of the last few deltas rises above the average of the
 * many before them (it accelerates); the tail decays. A stroke starts where pushing begins again after the tail has been decaying
 * (a hysteresis: the last 10 must fall under `REARM` of the last 70 first), after a pause, or the other way.
 */
export class AccelerationStrokes implements StrokeDetector {
	private deltas: number[] = [];
	private last = -Infinity;
	private dir = 0;
	private armed = true;
	private recent: [number, number][] = [];
	private fired = -Infinity;
	constructor(
		private readonly end = 3,
		private readonly middle = 70,
		private readonly rise = 1.3,
		private readonly rearm = 0.85,
	) {}

	feed(e: WheelSample): -1 | 0 | 1 {
		if (e.ctrl || Math.abs(e.dx) <= Math.abs(e.dy)) return 0;
		const dir = Math.sign(e.dx);
		if (e.t - this.last > GESTURE_GAP_MS || dir !== this.dir) {
			this.deltas = [];
			this.recent = [];
			this.armed = true;
		}
		this.last = e.t;
		this.dir = dir;
		this.recent = [...this.recent.filter(([t]) => e.t - t < MIN_STROKE_MS), [e.t, Math.abs(e.dx)]];
		this.deltas.push(Math.abs(e.dx));
		if (this.deltas.length > 150) this.deltas.shift();
		const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
		/** The last `end` deltas against the `middle` before them: a new push stands out from the tail it interrupts. */
		const endAvg = mean(this.deltas.slice(-this.end));
		const middleAvg = mean(this.deltas.slice(-this.end - this.middle, -this.end));
		if (!this.armed && endAvg < middleAvg * this.rearm) this.armed = true;
		if (!this.armed) return 0;
		const pushing = this.deltas.length <= this.end || endAvg >= middleAvg * this.rise;
		if (!pushing) return 0;
		if (this.recent.reduce((sum, [, d]) => sum + d, 0) < MIN_STROKE_PX) return 0;
		if (e.t - this.fired < MIN_STROKE_INTERVAL_MS && this.deltas.length > this.end) {
			this.armed = false;
			return 0;
		}
		this.armed = false;
		this.fired = e.t;
		return dir as -1 | 1;
	}
}

/** Lethargy's rule: a delta it calls intentional after inertia, a pause or the other way starts a stroke. */
export class LethargyStrokes implements StrokeDetector {
	private readonly lethargy = new Lethargy();
	private last = -Infinity;
	private dir = 0;
	private armed = true;
	private recent: [number, number][] = [];

	feed(e: WheelSample): -1 | 0 | 1 {
		if (e.ctrl || Math.abs(e.dx) <= Math.abs(e.dy)) return 0;
		const dir = Math.sign(e.dx);
		const intent = this.lethargy.check({ deltaY: -e.dx });
		this.recent = [...this.recent.filter(([t]) => e.t - t < MIN_STROKE_MS), [e.t, Math.abs(e.dx)]];
		if (e.t - this.last > GESTURE_GAP_MS || dir !== this.dir) {
			this.armed = true;
			this.recent = [[e.t, Math.abs(e.dx)]];
		}
		this.last = e.t;
		this.dir = dir;
		if (!intent) {
			this.armed = true;
			return 0;
		}
		if (!this.armed) return 0;
		if (this.recent.reduce((sum, [, d]) => sum + d, 0) < MIN_STROKE_PX) return 0;
		this.armed = false;
		return dir as -1 | 1;
	}
}

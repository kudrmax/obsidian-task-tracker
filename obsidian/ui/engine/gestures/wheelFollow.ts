import type { WheelSample } from "./wheelStrokes";

/**
 * What the fingers on the trackpad did, as the ribbon follows them: they began a stroke (`fresh`: a new touch; otherwise
 * the same stroke pushing again after a lift that was not one), moved `dx` px, or let go at `speed` px/ms.
 */
export type WheelCue = { readonly kind: "begin"; readonly t: number; readonly fresh: boolean } | { readonly kind: "move"; readonly t: number; readonly dx: number } | { readonly kind: "release"; readonly t: number; readonly speed: number };

/**
 * The DOM's wheel event carries no finger phase (Chromium dispatches neither the phase's end nor its «may begin»,
 * `MouseWheelEventManager::HandleWheelEvent`), so the lift is read from the deltas. macOS's momentum after a lift is the
 * OS's own curve: one event a frame at the display's pace, each delta the one before or a little less; the fingers'
 * deltas come unevenly (two events a millisecond or two apart, a frame missed) and rise and fall. So the momentum has
 * begun once the last `momentumEvents` deltas came a frame apart each, none larger than the one before by more than
 * `ROUNDING` px, and the last no larger than the first. Measured offline on Max's recordings (stage0.md, «Round seven»).
 *//** The OS rounds the momentum's deltas to whole pixels: a delta may stand a pixel above the one before. */
const ROUNDING = 1;
/** A frame apart: the momentum's events come 5–12 ms after each other at 120 Hz; one event may carry two frames (Chromium hands the page one per display frame). */
const FRAME_MS = 1000 / 120;
const FRAME_MIN_MS = 5;
const FRAME_MAX_MS = 18;

/** The numbers the rule is tuned by (offline, on Max's recordings). */
export interface WheelFollowTuning {
	/** How many frame-paced, non-rising deltas make the momentum. */
	readonly momentumEvents: number;
	/** Slower than this a frame, px, the fingers and their momentum look alike: such a momentum is taken as the fingers' and moves the columns a little, the lift then read from the quiet. */
	readonly momentumMinPx: number;
	/** No delta this long while the fingers are on: they stopped and lifted (or rest; the page cannot tell, the OS sends nothing). Just under @use-gesture's wheel end (140 ms), which asks. */
	readonly quietMs: number;
	/** No hand touches again this soon after it lifted: a fall of the deltas this soon after a lift was the fingers slowing, the same stroke. */
	readonly retouchMs: number;
}

export const WHEEL_FOLLOW: WheelFollowTuning = { momentumEvents: 4, momentumMinPx: 10, quietMs: 130, retouchMs: 40 };
/** A touch stops the momentum at once: the next delta falls under this share of the momentum's last, or none comes this long. */
const CUT = 0.6;
const MOMENTUM_GAP_MS = 45;
/** The momentum's last pixels come sparser, 17–67 ms apart (Max's recordings): none of them is a touch, nor a gap between them. */
const TAIL_GAP_MS = 100;
/** The momentum never rises: a delta this much above the one before is the fingers pushing on (the lift was not one). */
const RISE_PX = 3;
const RISE = 0.15;

type State = "idle" | "fingers" | "momentum";

/**
 * The Mac trackpad's two fingers turned into the cues of a finger on glass (Max, 2026-11-19: «что пальцем по экрану,
 * что пальцем по трекпаду — абсолютно одно и то же действие»): while they move, each delta moves the columns; at the
 * lift (the momentum's start) they let go with their speed; the momentum moves nothing; a touch during it begins a new
 * stroke. Vertical deltas and a pinch are not the ribbon's.
 */
export class WheelFollow {
	private readonly tuning: WheelFollowTuning;
	private state: State = "idle";
	private dir = 0;
	private last = -Infinity;
	private recent: { readonly t: number; readonly d: number }[] = [];
	private lifted = -Infinity;

	constructor(tuning: WheelFollowTuning = WHEEL_FOLLOW) {
		this.tuning = tuning;
	}

	feed(e: WheelSample): WheelCue[] {
		if (e.ctrl || Math.abs(e.dx) <= Math.abs(e.dy)) return [];
		if (this.inTail(e)) {
			this.last = e.t;
			return [];
		}
		const cues: WheelCue[] = [...this.tick(e.t)];
		const prev = this.recent[this.recent.length - 1];
		const d = Math.abs(e.dx) / (prev && e.t - prev.t <= MOMENTUM_GAP_MS ? Math.max(1, Math.round((e.t - prev.t) / FRAME_MS)) : 1);
		const dir = Math.sign(e.dx);
		const turned = dir !== this.dir;
		if (this.state === "idle" || turned || e.t - this.last > (this.state === "momentum" ? MOMENTUM_GAP_MS : this.tuning.quietMs)) {
			if (this.state === "fingers") cues.push(this.release(this.last, 0));
			cues.push(this.begin(e, true));
		} else if (this.state === "momentum" && prev) {
			/** A fall within the rounding (2 px to 1) is the momentum's own. */
			if (d < prev.d * CUT && prev.d - d > ROUNDING) cues.push(this.begin(e, e.t - this.lifted > this.tuning.retouchMs));
			else if (d >= prev.d + Math.max(RISE_PX, prev.d * RISE)) cues.push(this.begin(e, false));
		}
		this.dir = dir;
		this.last = e.t;
		this.recent = [...this.recent.filter((r) => r.t > e.t - FRAME_MAX_MS * this.tuning.momentumEvents), { t: e.t, d }].slice(-Math.max(this.tuning.momentumEvents, 32));
		if (this.state !== "fingers") return cues;
		cues.push({ kind: "move", t: e.t, dx: e.dx });
		if (this.momentumBegan()) {
			this.state = "momentum";
			this.lifted = e.t;
			cues.push({ kind: "release", t: e.t, speed: this.speed() });
		}
		return cues;
	}

	/** The fingers quiet past `quietMs`: they let go where they stand, without speed. */
	tick(now: number): WheelCue[] {
		if (this.state === "fingers" && now - this.last > this.tuning.quietMs) return [this.release(this.last + this.tuning.quietMs, 0)];
		if (this.state === "momentum" && now - this.last > (this.tailing() ? TAIL_GAP_MS : MOMENTUM_GAP_MS)) this.state = "idle";
		return [];
	}

	/** When the next `tick` can let go, if nothing comes before. */
	get quietAt(): number | null {
		return this.state === "fingers" ? this.last + this.tuning.quietMs : null;
	}

	/** The momentum fallen to the rounding: a pixel a frame and less. */
	private tailing(): boolean {
		const prev = this.recent[this.recent.length - 1];
		return this.state === "momentum" && !!prev && prev.d <= ROUNDING;
	}

	/** One of the momentum's last pixels: the same way, a pixel or less, however sparse the OS lets them come. */
	private inTail(e: WheelSample): boolean {
		const prev = this.recent[this.recent.length - 1];
		const fading = this.state === "momentum" && !!prev && prev.d <= 2 * ROUNDING;
		return fading && Math.sign(e.dx) === this.dir && Math.abs(e.dx) <= ROUNDING && e.t - this.last <= TAIL_GAP_MS;
	}

	private begin(e: WheelSample, fresh: boolean): WheelCue {
		this.state = "fingers";
		if (fresh) this.recent = [];
		return { kind: "begin", t: e.t, fresh };
	}

	private release(t: number, speed: number): WheelCue {
		this.state = "idle";
		return { kind: "release", t, speed };
	}

	private momentumBegan(): boolean {
		const run = this.recent.slice(-this.tuning.momentumEvents);
		if (run.length < this.tuning.momentumEvents) return false;
		for (let i = 1; i < run.length; i++) {
			const gap = run[i].t - run[i - 1].t;
			if (gap < FRAME_MIN_MS || gap > FRAME_MAX_MS || run[i].d > run[i - 1].d + ROUNDING) return false;
		}
		return run[run.length - 1].d <= run[0].d && run[0].d >= this.tuning.momentumMinPx;
	}

	/** The fingers' speed as they let go, px/ms, signed as the deltas: the momentum's first frame, which the OS starts at the fingers' speed. */
	private speed(): number {
		return (this.dir * this.recent[this.recent.length - this.tuning.momentumEvents].d) / FRAME_MS;
	}
}

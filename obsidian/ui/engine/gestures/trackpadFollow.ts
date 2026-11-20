import type { WheelCue } from "./wheelFollow";
import type { WheelSample } from "./wheelStrokes";

/**
 * What macOS says of the fingers on the trackpad, each at the moment of its own event on the page's clock (the wheel
 * events' `timeStamp`): they touched (`down`), they lifted (`up`, with the moment of their last movement, null when they
 * moved none), or the momentum after a lift ended (`momentumEnded`, with its last delta in px).
 */
export type FingerSignal =
	| { readonly kind: "down"; readonly t: number }
	| { readonly kind: "up"; readonly t: number; readonly lastMove: number | null }
	| { readonly kind: "momentumEnded"; readonly t: number; readonly last: number };

/** The fingers on the Mac's trackpad, where the host can hear them (Decision 126): what `listen` returns stops listening. */
export interface TrackpadFingers {
	listen(win: Window, listener: (signal: FingerSignal) => void): () => void;
}

/** The numbers the rule goes by, measured on Max's probe session (2026-11-20). */
export interface TrackpadTuning {
	/** A momentum that ends at this delta or more was cut by fingers: macOS ends it 25–93 ms before it says they touched. A natural end is down to 1–2 px. */
	readonly cutPx: number;
	/** A wheel event can reach the page before the touch it belongs to (signals 0.5–4 ms, wheels 0.3–25 ms): kept this long for it. */
	readonly earlyMs: number;
	/** How far the page's clock and macOS's may part as the host reads them (measured 0.06 ms; the page reads time to 0.1 ms, and the fingers send two deltas as little as 0.3 ms apart): a touch's first delta may stand this much before it, a lift's last this much after the page's. */
	readonly clockMs: number;
}

export const TRACKPAD: TrackpadTuning = { cutPx: 3, earlyMs: 30, clockMs: 0.25 };

/** The trackpad's own pace, one event every 8.3 ms: the shortest stretch a speed is read over. */
const EVENT_MS = 1000 / 120;

type Owner = "undecided" | "ribbon" | "other";

interface Touch {
	readonly from: number;
	owner: Owner;
	/** False for a momentum's cut, until macOS says the fingers touched. */
	confirmed: boolean;
	/** The lift; null while the fingers are down. */
	until: number | null;
	lastMove: number | null;
	/** The latest wheel event of this touch the page has seen. */
	seen: number;
	readonly moves: { readonly t: number; readonly dx: number }[];
}

/**
 * Two fingers on the Mac's trackpad as one finger on glass (Decision 126), read from macOS's own touch and lift instead of
 * the deltas' pace (`WheelFollow`, the path without the native module): a touch stops the columns at once and the
 * fingers' deltas move them 1:1; the lift lets them go at the fingers' speed; the momentum's deltas move nothing. A touch
 * is the ribbon's when it lands on moving columns, or when its first movement is sideways. The lift waits for the deltas
 * of the fingers still on their way to the page (they come 0.3–25 ms after macOS's signal), up to the one macOS saw last.
 */
export class TrackpadFollow {
	private readonly tuning: TrackpadTuning;
	private touch: Touch | null = null;
	private early: WheelSample[] = [];

	constructor(tuning: TrackpadTuning = TRACKPAD) {
		this.tuning = tuning;
	}

	/** A signal from macOS; `moving`: the columns are landing under the pointer, so a touch stops them. */
	signal(s: FingerSignal, moving: boolean): WheelCue[] {
		if (s.kind === "down") return this.down(s.t, moving);
		if (s.kind === "momentumEnded") return this.touch || !moving || s.last < this.tuning.cutPx ? [] : this.start(s.t, "ribbon", false);
		return this.up(s.t, s.lastMove);
	}

	feed(e: WheelSample): WheelCue[] {
		const touch = this.touch;
		if (!touch) {
			this.early = [...this.early.filter((w) => w.t > e.t - this.tuning.earlyMs), e];
			return [];
		}
		if (e.t < touch.from) return [];
		if (touch.until !== null && e.t > touch.until) return touch.owner === "ribbon" ? this.release() : [];
		touch.seen = Math.max(touch.seen, e.t);
		const cues: WheelCue[] = [];
		if (touch.owner === "undecided") {
			if (e.ctrl || Math.abs(e.dy) > Math.abs(e.dx)) touch.owner = "other";
			else if (e.dx !== 0) {
				touch.owner = "ribbon";
				cues.push({ kind: "begin", t: e.t, fresh: true });
			}
		}
		if (touch.owner === "ribbon" && !e.ctrl && e.dx !== 0) {
			touch.moves.push({ t: e.t, dx: e.dx });
			cues.push({ kind: "move", t: e.t, dx: e.dx });
		}
		if (touch.until !== null && this.allSeen(touch)) cues.push(...this.release());
		return cues;
	}

	/** The wheel quiet (@use-gesture's wheel end): a lift still waiting for its last deltas lets go, and a cut no touch followed was not one. */
	tick(): WheelCue[] {
		const touch = this.touch;
		if (!touch) return [];
		if (touch.until !== null || !touch.confirmed) return touch.owner === "ribbon" ? this.release() : this.end();
		return [];
	}

	/** Whether fingers that are the ribbon's are on the trackpad or their lift is on its way. */
	get holding(): boolean {
		return this.touch?.owner === "ribbon";
	}

	private down(t: number, moving: boolean): WheelCue[] {
		const touch = this.touch;
		if (touch && touch.until === null && !touch.confirmed) {
			touch.confirmed = true;
			return [];
		}
		const ended = touch ? (touch.owner === "ribbon" ? this.release() : this.end()) : [];
		return [...ended, ...this.start(t, moving ? "ribbon" : "undecided", true)];
	}

	private start(t: number, owner: Owner, confirmed: boolean): WheelCue[] {
		const from = confirmed ? t - this.tuning.clockMs : t;
		this.touch = { from, owner, confirmed, until: null, lastMove: null, seen: -Infinity, moves: [] };
		const cues: WheelCue[] = owner === "ribbon" ? [{ kind: "begin", t, fresh: true }] : [];
		const early = this.early.filter((w) => w.t >= from);
		this.early = [];
		for (const w of early) cues.push(...this.feed(w));
		return cues;
	}

	private up(t: number, lastMove: number | null): WheelCue[] {
		const touch = this.touch;
		if (!touch || touch.until !== null) return [];
		touch.until = t;
		touch.lastMove = lastMove;
		if (touch.owner !== "ribbon") return this.end();
		return this.allSeen(touch) ? this.release() : [];
	}

	/** The page has the fingers' last delta: macOS's moment of it, read on the page's clock, within the clocks' parting. */
	private allSeen(touch: Touch): boolean {
		return touch.lastMove === null || touch.seen >= touch.lastMove - this.tuning.clockMs;
	}

	private release(): WheelCue[] {
		const touch = this.touch;
		if (!touch) return [];
		this.touch = null;
		const at = touch.until ?? Math.max(touch.from, touch.seen);
		return [{ kind: "release", t: at, speed: speedAt(touch.moves, at) }];
	}

	private end(): WheelCue[] {
		this.touch = null;
		return [];
	}
}

/**
 * The fingers' speed as they lift, px/ms, as macOS starts its momentum at (measured on Max's session: the same flicks on
 * every lift): their last two deltas over the time since the delta before them; a pause before the lift of more than one of
 * the trackpad's events slows it, and two such stop it.
 */
function speedAt(moves: readonly { readonly t: number; readonly dx: number }[], at: number): number {
	const last = moves[moves.length - 1];
	if (!last) return 0;
	const before = moves[moves.length - 2];
	const since = moves[moves.length - 3]?.t ?? (before ?? last).t - EVENT_MS;
	const speed = (last.dx + (before?.dx ?? 0)) / Math.max(EVENT_MS, last.t - since);
	return speed * Math.min(1, Math.max(0, 2 - (at - last.t) / EVENT_MS));
}

import type { Shift } from "./screens";
import type { SwipeTarget } from "./Swipe";

/** The way from the screen that stands to the next one, one way: what moves while a finger draws it. */
export interface ScreenTrack {
	/** How far the screen travels to stand on the next one; null where the row of screens ends. */
	readonly distance: number | null;
	/** The screen drawn `dx` px from where it stood, left negative. */
	at(dx: number): void;
	/** It stands again: on the next screen, or back where it was. */
	land(arrived: boolean): void;
}

export interface ScreenPagerDeps {
	/** The way to the next screen `shift`'s way, from the screen as it stands now. */
	track(shift: Shift): ScreenTrack;
	/** How long a whole screen's travel takes once let go, ms. */
	duration(): number;
	/** The travel the time is measured against at the row's end, where there is no next screen. */
	width(): number;
}

interface Settling {
	readonly track: ScreenTrack;
	readonly arrived: boolean;
	readonly from: number;
	readonly to: number;
	readonly ms: number;
	start: number | null;
	frame: number;
	/** Stands it anyway once its time is up: a page out of sight draws no frames. */
	timer: number;
	readonly resolve: () => void;
}

/** How long past its time a run waits for its last frame before it stands anyway. */
const FRAME_SLACK_MS = 100;

/** Let go, the screen runs on fast and slows to a stop, as a photo in a gallery does. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/**
 * The screen under the finger: it follows the finger either way, one way's track at a time, and once let go it runs
 * on to the next screen or back to where it stood. A finger that draws it while it runs catches it where it is seen.
 */
export class ScreenPager implements SwipeTarget {
	private way: { readonly shift: Shift; readonly track: ScreenTrack } | null = null;
	private shift: Shift | null = null;
	private dx = 0;
	private settling: Settling | null = null;
	/** Resolves once the screen stands after the settle under way. */
	private ending: Promise<void> = Promise.resolve();
	/** How many times a finger caught the screen as it ran: a turn asked for before the last catch is dropped. */
	private catches = 0;

	constructor(private readonly deps: ScreenPagerDeps) {}

	distance(shift: Shift): number | null {
		this.finish();
		return this.trackOf(shift).distance;
	}

	follow(dx: number): void {
		this.finish();
		if (dx !== 0) this.shift = dx < 0 ? 1 : -1;
		this.dx = dx;
		if (this.shift !== null) this.trackOf(this.shift).at(dx);
	}

	settle(shift: Shift | null): Promise<void> {
		this.finish();
		const track = this.way?.shift === this.shift ? this.way.track : null;
		if (!track || this.shift === null) {
			this.reset();
			return Promise.resolve();
		}
		const arrived = shift === this.shift && track.distance !== null;
		const to = arrived && track.distance !== null ? -this.shift * track.distance : 0;
		const span = track.distance ?? this.deps.width();
		const ms = span > 0 ? this.deps.duration() * Math.min(1, Math.abs(to - this.dx) / span) : 0;
		return (this.ending = new Promise((resolve) => {
			const settling: Settling = { track, arrived, from: this.dx, to, ms, start: null, frame: 0, timer: 0, resolve };
			this.settling = settling;
			if (ms <= 0) return this.finish();
			settling.frame = requestAnimationFrame((time) => this.frame(settling, time));
			settling.timer = window.setTimeout(() => this.finish(), ms + FRAME_SLACK_MS);
		}));
	}

	/** A tap while the screen runs to its place: it runs on from where it is, never put there in one frame; the tap is free to go to what it hit. */
	stand(): void {}

	/** Counts the catches: a turn asked for when it was lower than now is dropped (`run`). */
	get caught(): number {
		return this.catches;
	}

	/**
	 * A finger draws the screen while it runs (a swipe let go, or an arrow's turn): it stops where it is seen, on the way
	 * it was going, and the finger draws it on from there, as a scroll catches its glide; turns waiting for it are dropped.
	 */
	catch(): number {
		const settling = this.settling;
		if (!settling) return this.dx;
		this.catches++;
		this.settling = null;
		cancelAnimationFrame(settling.frame);
		window.clearTimeout(settling.timer);
		settling.resolve();
		return this.dx;
	}

	/**
	 * With no finger, as an arrow turns it: the screen runs the whole way to the next one `shift`'s way along the track
	 * `make` draws, as one let go at its start would. What was running (a swipe let go) runs on to its place first, never
	 * put there in one frame (decisions 32 and 51).
	 */
	run(shift: Shift, make: () => ScreenTrack): Promise<void> {
		if (this.settling) {
			const caught = this.catches;
			return this.ending.then(() => (caught === this.catches ? this.run(shift, make) : undefined));
		}
		this.reset();
		const track = make();
		this.way = { shift, track };
		this.shift = shift;
		return this.settle(shift);
	}

	private frame(settling: Settling, time: number): void {
		if (this.settling !== settling) return;
		settling.start ??= time;
		const t = Math.min(1, (time - settling.start) / settling.ms);
		if (t >= 1) return this.finish();
		this.dx = settling.from + (settling.to - settling.from) * easeOut(t);
		settling.track.at(this.dx);
		settling.frame = requestAnimationFrame((next) => this.frame(settling, next));
	}

	/**
	 * The screen stands where it was going: on the next screen or back. Whatever the track does as it lands, the pager is
	 * free again and the settle resolves, so nothing waiting on it (the swipe's hold on the screen, the next turn) is kept.
	 */
	private finish(): void {
		const settling = this.settling;
		if (!settling) return;
		this.settling = null;
		cancelAnimationFrame(settling.frame);
		window.clearTimeout(settling.timer);
		this.way = null;
		this.shift = null;
		this.dx = 0;
		try {
			settling.track.at(settling.to);
			settling.track.land(settling.arrived);
		} finally {
			settling.resolve();
		}
	}

	private reset(): void {
		this.way?.track.land(false);
		this.way = null;
		this.shift = null;
		this.dx = 0;
	}

	/**
	 * One way at a time: the screen turned the other way drops the way it was drawn first, so the new way is drawn from
	 * the screen as it stands, never from the screen as the other way holds it.
	 */
	private trackOf(shift: Shift): ScreenTrack {
		if (this.way?.shift === shift) return this.way.track;
		this.way?.track.land(false);
		this.way = null;
		const track = this.deps.track(shift);
		this.way = { shift, track };
		return track;
	}
}

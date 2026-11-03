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
	readonly resolve: () => void;
}

/** Let go, the screen runs on fast and slows to a stop, as a photo in a gallery does. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/**
 * The screen under the finger: it follows the finger either way, each way along its own track, and once let go it runs
 * on to the next screen or back to where it stood. A new swipe while it runs puts it where it was going at once.
 */
export class ScreenPager implements SwipeTarget {
	private readonly tracks = new Map<Shift, ScreenTrack>();
	private shift: Shift | null = null;
	private dx = 0;
	private settling: Settling | null = null;

	constructor(private readonly deps: ScreenPagerDeps) {}

	distance(shift: Shift): number | null {
		this.finish();
		return this.trackOf(shift).distance;
	}

	follow(dx: number): void {
		this.finish();
		if (dx !== 0) {
			const shift: Shift = dx < 0 ? 1 : -1;
			if (this.shift !== null && this.shift !== shift) this.tracks.get(this.shift)?.at(0);
			this.shift = shift;
		}
		this.dx = dx;
		if (this.shift !== null) this.trackOf(this.shift).at(dx);
	}

	settle(shift: Shift | null): Promise<void> {
		this.finish();
		const track = this.shift === null ? null : this.tracks.get(this.shift);
		if (!track || this.shift === null) {
			this.reset();
			return Promise.resolve();
		}
		const arrived = shift === this.shift && track.distance !== null;
		const to = arrived && track.distance !== null ? -this.shift * track.distance : 0;
		const span = track.distance ?? this.deps.width();
		const ms = span > 0 ? this.deps.duration() * Math.min(1, Math.abs(to - this.dx) / span) : 0;
		return new Promise((resolve) => {
			const settling: Settling = { track, arrived, from: this.dx, to, ms, start: null, frame: 0, resolve };
			this.settling = settling;
			if (ms <= 0) return this.finish();
			settling.frame = requestAnimationFrame((time) => this.frame(settling, time));
		});
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

	/** The screen stands where it was going: on the next screen or back. */
	private finish(): void {
		const settling = this.settling;
		if (!settling) return;
		this.settling = null;
		cancelAnimationFrame(settling.frame);
		settling.track.at(settling.to);
		for (const track of this.tracks.values()) if (track !== settling.track) track.land(false);
		settling.track.land(settling.arrived);
		this.tracks.clear();
		this.shift = null;
		this.dx = 0;
		settling.resolve();
	}

	private reset(): void {
		for (const track of this.tracks.values()) track.land(false);
		this.tracks.clear();
		this.shift = null;
		this.dx = 0;
	}

	private trackOf(shift: Shift): ScreenTrack {
		let track = this.tracks.get(shift);
		if (!track) {
			track = this.deps.track(shift);
			this.tracks.set(shift, track);
		}
		return track;
	}
}

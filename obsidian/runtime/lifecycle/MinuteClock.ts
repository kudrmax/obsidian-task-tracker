import type { Timers } from "../../../core/application/ports";

const MINUTE_MS = 60_000;

/** The minute of a moment: what views are memoised by besides the replica. */
export function minuteOf(nowMs: number): number {
	return Math.floor(nowMs / MINUTE_MS);
}

export interface MinuteClockDeps {
	readonly timers: Timers;
	readonly now: () => number;
	/** The core's today now (`days.today`, by the settings' day start). */
	readonly today: () => string;
	/** Each new minute: views are read again. */
	readonly minute: () => void;
	/** The core's day boundary passed: the file is tidied for the new day. */
	readonly newDay: () => void;
}

/**
 * The clock the runtime keeps while it runs: a tick at each minute's start, and a new day when the core's today changes
 * (the day boundary of the settings, not midnight as such).
 */
export class MinuteClock {
	private timer: number | null = null;
	private day: string | null = null;

	constructor(private readonly deps: MinuteClockDeps) {}

	start(): void {
		this.day = this.deps.today();
		this.arm();
	}

	stop(): void {
		if (this.timer !== null) this.deps.timers.clear(this.timer);
		this.timer = null;
	}

	private arm(): void {
		const now = this.deps.now();
		const next = (minuteOf(now) + 1) * MINUTE_MS;
		this.timer = this.deps.timers.set(() => this.tick(), next - now);
	}

	private tick(): void {
		this.timer = null;
		const today = this.deps.today();
		if (today !== this.day) {
			this.day = today;
			this.deps.newDay();
		}
		this.deps.minute();
		this.arm();
	}
}

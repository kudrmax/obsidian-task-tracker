export interface PollingTimers {
	set(fn: () => void, ms: number): number;
	clear(id: number): void;
}

export interface PollingDeps {
	/** Fetches the events afresh. */
	readonly refresh: () => Promise<void>;
	/** Milliseconds between fetches; zero turns the timer off. */
	readonly intervalMs: () => number;
	/** The view is not on screen: the document is hidden or its tab is behind another. The timer goes on without fetching. */
	readonly hidden: () => boolean;
	/** Milliseconds, for how long ago the last fetch was. */
	readonly now: () => number;
	readonly timers: PollingTimers;
}

/**
 * Keeps the events fresh while the view is on screen: a fetch every interval, one at once on Refresh now, and one when
 * the app or the window comes back unless the last is under half an interval old. A tick missed off screen is fetched
 * when the view is back. Every fetch restarts the interval; asked during a fetch, it waits for that one.
 */
export class CalendarPolling {
	private timer: number | null = null;
	private running: Promise<void> | null = null;
	private started = false;
	private missed = false;
	private lastAt = -Infinity;

	constructor(private readonly deps: PollingDeps) {}

	/** The view opens with a fetch of its own. */
	start(): void {
		this.started = true;
		this.lastAt = this.deps.now();
		this.schedule();
	}

	stop(): void {
		this.started = false;
		this.cancel();
	}

	/** Always fetches: Refresh now. */
	refresh(): Promise<void> {
		this.schedule();
		this.running ??= this.deps.refresh().finally(() => {
			this.running = null;
			this.lastAt = this.deps.now();
			this.missed = false;
		});
		return this.running;
	}

	/** The window got the focus or the app came to the front: a fetch, unless the last one is recent. */
	wake(): void {
		if (this.deps.hidden()) {
			this.missed = true;
			return;
		}
		const ms = this.deps.intervalMs();
		if (ms > 0 && this.deps.now() - this.lastAt < ms / 2) return;
		void this.refresh();
	}

	/** The view is on screen again: the tick it missed is fetched now. */
	catchUp(): void {
		if (this.missed && !this.deps.hidden()) void this.refresh();
	}

	private tick(): void {
		this.timer = null;
		if (this.deps.hidden()) {
			this.missed = true;
			this.schedule();
		} else void this.refresh();
	}

	private schedule(): void {
		this.cancel();
		const ms = this.deps.intervalMs();
		if (this.started && ms > 0) this.timer = this.deps.timers.set(() => this.tick(), ms);
	}

	private cancel(): void {
		if (this.timer !== null) this.deps.timers.clear(this.timer);
		this.timer = null;
	}
}

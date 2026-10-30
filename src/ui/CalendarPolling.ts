export interface PollingTimers {
	set(fn: () => void, ms: number): number;
	clear(id: number): void;
}

export interface PollingDeps {
	/** Fetches the events afresh. */
	readonly refresh: () => Promise<void>;
	/** Milliseconds between fetches; zero turns the timer off. */
	readonly intervalMs: () => number;
	/** The screen is not seen: the timer goes on without fetching. */
	readonly hidden: () => boolean;
	readonly timers: PollingTimers;
}

/**
 * Keeps the events fresh while the view is open: a fetch every interval, and one at once when asked (the app came back to the
 * front, a pull, Refresh now). Every fetch restarts the interval; asked during a fetch, it waits for that one.
 */
export class CalendarPolling {
	private timer: number | null = null;
	private running: Promise<void> | null = null;
	private started = false;

	constructor(private readonly deps: PollingDeps) {}

	start(): void {
		this.started = true;
		this.schedule();
	}

	stop(): void {
		this.started = false;
		this.cancel();
	}

	refresh(): Promise<void> {
		this.schedule();
		this.running ??= this.deps.refresh().finally(() => (this.running = null));
		return this.running;
	}

	private tick(): void {
		this.timer = null;
		if (this.deps.hidden()) this.schedule();
		else void this.refresh();
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

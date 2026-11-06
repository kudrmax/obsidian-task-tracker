import type { Timers } from "../../core/application/ports";

/**
 * Sync's state as the waiting rule needs it. "off": no Sync in this vault (the core plugin disabled, or no remote vault).
 * "loading": Sync is on but hasn't read its data yet, as right after a cold start; it runs by itself once loaded.
 */
export type SyncStatus = "off" | "loading" | "paused" | "error" | "syncing" | "synced";

export interface SyncSnapshot {
	readonly status: SyncStatus;
	/** A run is going: true from `requestSync` until its loop ends, whatever the status text says meanwhile. */
	readonly running: boolean;
	/** The server has answered since the last (re)connect; a run that ends before it has not seen the server's changes. */
	readonly ready: boolean;
	/** The socket to the server is open. */
	readonly connected: boolean;
	/** When the server last sent anything, ping answers included; grows on every message. null: unknown. */
	readonly heardAt: number | null;
}

/** Obsidian Sync as the plugin drives it. */
export interface SyncControl {
	snapshot(): SyncSnapshot;
	/** Asks for a run; does nothing when one is going. */
	request(): void;
	/** Pings the server, as Sync's own heartbeat does: a live socket answers, which moves `heardAt`. */
	probe(): void;
	/** Calls `listener` on every change of Sync's state. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

export const SYNC_TIMEOUT_MS = 45_000;
/** How long Sync stays still after a finished run before it counts as done: the phone may notice the app's write late. */
export const SYNC_QUIET_MS = 3_000;
/** After a run that ended without a proven server, the next run is asked for this much later. */
export const SYNC_RETRY_MS = 1_000;

export const SYNC_REASONS = {
	off: "Obsidian Sync is off in this vault",
	paused: "Obsidian Sync is paused",
	error: "Obsidian Sync reported an error",
	timeout: "Obsidian Sync didn't finish in 45 seconds",
} as const;

/** Leaving Obsidian: the phone hides it when Max goes back to the app, home or elsewhere. */
export interface LeaveSignal {
	/** Calls `listener` when Obsidian leaves the screen. Returns the unsubscribe. */
	onLeave(listener: () => void): () => void;
}

/** `left`: Max left Obsidian, or the plugin unloaded, before the end; nobody waits for an answer any more. */
export type SyncOutcome = { readonly kind: "synced" } | { readonly kind: "failed"; readonly reason: string } | { readonly kind: "left" };

/** A wait under way: its outcome, and the way to drop it. */
export interface SyncWaiting {
	readonly outcome: Promise<SyncOutcome>;
	/** Ends the wait as `left`. */
	cancel(): void;
}

const SYNCED: SyncOutcome = { kind: "synced" };
const LEFT: SyncOutcome = { kind: "left" };
/** Only the spec's reasons go back to the app: an empty one would leave its alert with a title alone. */
const failed = (why: keyof typeof SYNC_REASONS): SyncOutcome => ({ kind: "failed", reason: SYNC_REASONS[why] });

/**
 * Finished: a run that started after the request has ended `synced`, with the server ready, its socket open and heard
 * from since the request, and no new run started for SYNC_QUIET_MS. A run already going when the request came is let
 * finish and followed by a fresh one. A run that ends `synced` without that proof is followed by another run a moment
 * later, and an open socket not heard from gets one ping, so a dead one left from before the phone slept can't pass.
 * Leaving Obsidian ends the wait at once.
 */
export class SyncWait {
	constructor(
		private readonly sync: SyncControl,
		private readonly timers: Timers,
		private readonly leave: LeaveSignal,
	) {}

	run(): SyncWaiting {
		let waiting!: Waiting;
		const outcome = new Promise<SyncOutcome>((resolve) => (waiting = new Waiting(this.sync, this.timers, this.leave, resolve)));
		waiting.start();
		return { outcome, cancel: () => waiting.cancel() };
	}
}

class Waiting {
	private done = false;
	private running = false;
	/** The run going when the request came: it may have started before the app's write, so it doesn't count. */
	private stale = false;
	/** What the server had said by the request; it must say more before a run counts. */
	private heardAtRequest: number | null = null;
	/** One ping per wait: a live socket answers it at once, a reconnect proves itself by opening. */
	private probed = false;
	private quiet: number | null = null;
	private retry: number | null = null;
	private timeout: number | null = null;
	private unsubscribe: () => void = () => undefined;
	private stopLeave: () => void = () => undefined;

	constructor(
		private readonly sync: SyncControl,
		private readonly timers: Timers,
		private readonly leave: LeaveSignal,
		private readonly resolve: (outcome: SyncOutcome) => void,
	) {}

	start(): void {
		const first = this.sync.snapshot();
		if (first.status === "off") return this.finish(failed("off"));
		if (first.status === "paused") return this.finish(failed("paused"));
		this.running = first.running;
		this.stale = first.running;
		this.heardAtRequest = first.heardAt;
		this.timeout = this.timers.set(() => this.timedOut(), SYNC_TIMEOUT_MS);
		this.stopLeave = this.leave.onLeave(() => this.finish(LEFT));
		this.unsubscribe = this.sync.onChange(() => this.step());
		if (!this.stale) this.sync.request();
		this.step();
	}

	cancel(): void {
		this.finish(LEFT);
	}

	private step(): void {
		if (this.done) return;
		const now = this.sync.snapshot();
		if (now.status === "off") return this.finish(failed("off"));
		if (now.running) {
			this.running = true;
			this.stopQuiet();
			return;
		}
		if (!this.running) {
			if (now.status === "paused") this.finish(failed("paused"));
			return;
		}
		this.running = false;
		if (this.stale) {
			this.stale = false;
			this.sync.request();
			return;
		}
		this.ended(now);
	}

	/** The status a run ends with: a stop is judged whatever the server said; a success only with the server proven. */
	private ended(now: SyncSnapshot): void {
		if (now.status === "paused") return this.finish(failed("paused"));
		if (now.status === "error") return this.finish(failed("error"));
		if (now.status !== "synced" || this.quiet !== null) return;
		if (now.ready && now.connected && this.heardSinceRequest(now)) {
			this.quiet = this.timers.set(() => this.finish(SYNCED), SYNC_QUIET_MS);
			return;
		}
		if (now.connected && !this.heardSinceRequest(now) && !this.probed) {
			this.probed = true;
			this.sync.probe();
		}
		this.retry ??= this.timers.set(() => {
			this.retry = null;
			this.sync.request();
		}, SYNC_RETRY_MS);
	}

	private heardSinceRequest(now: SyncSnapshot): boolean {
		return now.heardAt === null || this.heardAtRequest === null || now.heardAt > this.heardAtRequest;
	}

	/** Files Sync keeps retrying show as an error while it goes on looping: that, not the clock, is why it didn't finish. */
	private timedOut(): void {
		this.finish(this.sync.snapshot().status === "error" ? failed("error") : failed("timeout"));
	}

	private stopQuiet(): void {
		if (this.quiet === null) return;
		this.timers.clear(this.quiet);
		this.quiet = null;
	}

	private finish(outcome: SyncOutcome): void {
		if (this.done) return;
		this.done = true;
		this.stopQuiet();
		for (const timer of [this.timeout, this.retry]) if (timer !== null) this.timers.clear(timer);
		this.unsubscribe();
		this.stopLeave();
		this.resolve(outcome);
	}
}

import type { Timers } from "../../core/application/ports";

/** Sync's state as the waiting rule needs it; "off" is every state with no remote vault to sync with. */
export type SyncStatus = "off" | "paused" | "error" | "syncing" | "synced";

export interface SyncSnapshot {
	readonly status: SyncStatus;
	/** A run is going: true from `requestSync` until its loop ends, whatever the status text says meanwhile. */
	readonly running: boolean;
	/** The server has answered since the last (re)connect; a run that ends before it has not seen the server's changes. */
	readonly ready: boolean;
}

/** Obsidian Sync as the plugin drives it. */
export interface SyncControl {
	snapshot(): SyncSnapshot;
	/** Asks for a run; does nothing when one is going. */
	request(): void;
	/** Calls `listener` on every change of Sync's state. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

export const SYNC_TIMEOUT_MS = 45_000;
/** How long Sync stays still after a finished run before it counts as done: the phone may notice the app's write late. */
export const SYNC_QUIET_MS = 3_000;

export const SYNC_REASONS = {
	off: "Obsidian Sync is off in this vault",
	paused: "Obsidian Sync is paused",
	error: "Obsidian Sync reported an error",
	timeout: "Obsidian Sync didn't finish in 45 seconds",
} as const;

export type SyncOutcome = { readonly synced: true } | { readonly synced: false; readonly reason: string };

const SYNCED: SyncOutcome = { synced: true };
const failed = (reason: string): SyncOutcome => ({ synced: false, reason });

/**
 * Finished: a run that started after the request has ended with the server ready and the status `synced`, and no new
 * run started for SYNC_QUIET_MS. A run already going when the request came is let finish and followed by a fresh one.
 */
export class SyncWait {
	constructor(
		private readonly sync: SyncControl,
		private readonly timers: Timers,
	) {}

	run(): Promise<SyncOutcome> {
		return new Promise((resolve) => new Waiting(this.sync, this.timers, resolve).start());
	}
}

class Waiting {
	private done = false;
	private running = false;
	/** The run going when the request came: it may have started before the app's write, so it doesn't count. */
	private stale = false;
	private quiet: number | null = null;
	private timeout: number | null = null;
	private unsubscribe: () => void = () => undefined;

	constructor(
		private readonly sync: SyncControl,
		private readonly timers: Timers,
		private readonly resolve: (outcome: SyncOutcome) => void,
	) {}

	start(): void {
		const first = this.sync.snapshot();
		if (first.status === "off") return this.finish(failed(SYNC_REASONS.off));
		if (first.status === "paused") return this.finish(failed(SYNC_REASONS.paused));
		this.running = first.running;
		this.stale = first.running;
		this.timeout = this.timers.set(() => this.finish(failed(SYNC_REASONS.timeout)), SYNC_TIMEOUT_MS);
		this.unsubscribe = this.sync.onChange(() => this.step());
		if (!this.stale) this.sync.request();
		this.step();
	}

	private step(): void {
		if (this.done) return;
		const now = this.sync.snapshot();
		if (now.status === "off") return this.finish(failed(SYNC_REASONS.off));
		if (now.running) {
			this.running = true;
			this.stopQuiet();
			return;
		}
		if (!this.running) {
			if (now.status === "paused") this.finish(failed(SYNC_REASONS.paused));
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

	private ended(now: SyncSnapshot): void {
		if (now.status === "paused") return this.finish(failed(SYNC_REASONS.paused));
		if (now.status === "error") return this.finish(failed(SYNC_REASONS.error));
		if (now.status === "synced" && now.ready && this.quiet === null) this.quiet = this.timers.set(() => this.finish(SYNCED), SYNC_QUIET_MS);
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
		if (this.timeout !== null) this.timers.clear(this.timeout);
		this.unsubscribe();
		this.resolve(outcome);
	}
}

import type { SyncControl, SyncSnapshot, SyncStatus } from "../../obsidian/infrastructure/SyncWait";

/**
 * Obsidian Sync driven by hand, behaving as the real one does: `request` starts a run at once (and fires the change)
 * unless one is going, paused or off; `finish` ends the current run with the status it leaves.
 */
export class FakeSync implements SyncControl {
	requests = 0;
	private status: SyncStatus;
	private running = false;
	private ready: boolean;
	private readonly listeners = new Set<() => void>();

	constructor(status: SyncStatus = "synced", { ready = true, running = false } = {}) {
		this.status = status;
		this.ready = ready;
		this.running = running;
		if (running) this.status = "syncing";
	}

	get listening(): number {
		return this.listeners.size;
	}

	snapshot(): SyncSnapshot {
		return { status: this.status, running: this.running, ready: this.ready };
	}

	request(): void {
		this.requests++;
		if (this.running || this.status === "off" || this.status === "paused") return;
		this.startRun();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** A run Sync starts by itself: a file changed, its 30-second timer, the server's first answer. */
	startRun(): void {
		this.running = true;
		this.status = "syncing";
		this.emit();
	}

	/** The run's text changed (Downloading…, Indexing…): an event with nothing flipped. */
	step(): void {
		this.emit();
	}

	finish(status: SyncStatus = "synced", { ready = this.ready } = {}): void {
		this.running = false;
		this.ready = ready;
		this.status = status;
		this.emit();
	}

	set(status: SyncStatus): void {
		this.status = status;
		this.emit();
	}

	private emit(): void {
		for (const listener of [...this.listeners]) listener();
	}
}

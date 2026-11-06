import type { SyncControl, SyncSnapshot, SyncStatus } from "../../obsidian/infrastructure/SyncWait";

/**
 * Obsidian Sync driven by hand, behaving as the real one does, only synchronously. `request` does nothing while a run is
 * going; while off, loading or paused it flips the run on and off (two changes) and the status stays; otherwise a run
 * starts and `finish` ends it with the status it leaves. The server: `heardAt` grows when a run talks to it (`finish`
 * by default) or when it answers a ping (`pong`).
 */
export class FakeSync implements SyncControl {
	requests = 0;
	probes = 0;
	private status: SyncStatus;
	private running = false;
	private ready: boolean;
	private connected = true;
	private heardAt = 100;
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
		return { status: this.status, running: this.running, ready: this.ready, connected: this.connected, heardAt: this.heardAt };
	}

	request(): void {
		this.requests++;
		if (this.running) return;
		if (this.status === "off" || this.status === "loading" || this.status === "paused") {
			this.running = true;
			this.emit();
			this.running = false;
			this.emit();
			return;
		}
		this.startRun();
	}

	probe(): void {
		this.probes++;
	}

	/** The server answers the ping. */
	pong(): void {
		this.heardAt++;
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

	/** Ends the run; `heard: false` is a run that sent nothing, `connected: false` one whose socket is gone. */
	finish(status: SyncStatus = "synced", { ready = this.ready, heard = true, connected = this.connected } = {}): void {
		this.running = false;
		this.ready = ready;
		this.connected = connected;
		if (heard) this.heardAt++;
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

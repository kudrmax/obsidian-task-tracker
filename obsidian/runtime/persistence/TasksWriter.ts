import type { Replica } from "../replica/Replica";
import type { PendingLog } from "./PendingLog";
import type { Rebaser } from "./Rebaser";
import type { TasksVault, VaultChange } from "./TasksVault";

/** How many times one write replays the pending calls over a file that keeps changing before it takes the file as it is. */
export const MAX_REPLAYS = 2;

export interface TasksWriterDeps {
	readonly vault: TasksVault;
	readonly replica: Replica;
	readonly log: PendingLog;
	readonly rebaser: Rebaser;
	/** The tasks file's path by the settings now; null for none. */
	readonly path: () => string | null;
	/** A write that failed for a reason of its own (the disk): told, and the queue goes on. */
	readonly failed: (error: unknown) => void;
}

/**
 * The tasks text's persistence (P3): one serial queue writing the replica's text over the base it was made from, compared
 * and set inside `vault.process`, so an outside write landing between the base and the write is never overwritten: the
 * file becomes the new base and the pending calls replay over it, at most twice a write. It also reads the file when it
 * changes elsewhere (our own echo finds the base and does nothing), creates a missing file, and drops the pending calls
 * when the file goes. It outlives the plugin object until it is empty (`drained`).
 */
export class TasksWriter {
	private running: Promise<void> | null = null;
	private recheck = false;
	private watched: string | null = null;

	constructor(private readonly deps: TasksWriterDeps) {}

	/** The file at the path read: the replica's base (the first build, and a new `tasksFile`). */
	async load(): Promise<void> {
		const path = this.deps.path();
		this.watched = path;
		if (path === null) return;
		const text = await this.deps.vault.read(path);
		if (path !== this.watched) return;
		if (text === null) this.deps.rebaser.gone(path);
		else this.adopt(text);
	}

	/** The settings name another tasks file: like a file that has gone, then the new one is read. */
	async follow(): Promise<void> {
		const old = this.watched;
		if (this.deps.path() === old) return;
		if (old !== null) this.deps.rebaser.gone(old);
		await this.load();
	}

	watch(): () => void {
		return this.deps.vault.watch((change) => this.changed(change));
	}

	/** The replica's text differs from the file's: a write is queued unless one runs, which picks it up. */
	schedule(): void {
		if (this.running) return;
		this.running = this.drain()
			.catch((e: unknown) => this.deps.failed(e))
			.finally(() => {
				this.running = null;
				if (this.recheck) {
					this.recheck = false;
					void this.readOutside();
				}
				if (this.dirty) this.schedule();
			});
	}

	/** Resolves once nothing is left to write. */
	async drained(): Promise<void> {
		while (this.running) await this.running;
	}

	private get dirty(): boolean {
		const tasks = this.deps.replica.state.tasks;
		return this.watched !== null && tasks !== null && tasks !== this.deps.log.base.text;
	}

	private adopt(text: string): void {
		this.deps.rebaser.rebase(text);
		this.schedule();
	}

	private changed(change: VaultChange): void {
		const path = this.watched;
		if (path === null) return;
		const left = (change.kind === "rename" && change.oldPath === path) || (change.kind === "delete" && change.path === path);
		if (!left && change.path !== path) return;
		if (this.running) this.recheck = true;
		else void this.readOutside();
	}

	/** The file read after a change event: our own echo, nothing new, a new base, or gone. */
	private async readOutside(): Promise<void> {
		const path = this.watched;
		if (path === null) return;
		const text = await this.deps.vault.read(path);
		if (path !== this.watched) return;
		if (this.running) {
			this.recheck = true;
			return;
		}
		if (text === this.deps.log.base.text) return;
		if (text === null) this.deps.rebaser.gone(path);
		else this.adopt(text);
	}

	private async drain(): Promise<void> {
		let replays = 0;
		for (;;) {
			const path = this.watched;
			const { log, replica, rebaser } = this.deps;
			if (path === null || !this.dirty) return;
			if (log.base.text === null) {
				await this.create(path);
				continue;
			}
			const write: { taken: { readonly text: string; readonly state: typeof replica.state; readonly seq: number } | null; away: boolean } = { taken: null, away: false };
			const outcome = await this.deps.vault.write(path, (current) => {
				if (this.deps.path() !== path) {
					write.away = true;
					return null;
				}
				const state = replica.state;
				if (current !== log.base.text || state.tasks === null) return null;
				write.taken = { text: state.tasks, state, seq: log.lastSeq };
				return state.tasks;
			});
			if (write.away) return;
			if (outcome.kind === "moved" || outcome.kind === "missing") {
				if (path === this.watched) rebaser.gone(path);
				return;
			}
			if (outcome.kind === "written" && write.taken !== null) {
				const { text, state, seq } = write.taken;
				log.persisted(text, state.history, state.ids, seq);
				replays = 0;
				continue;
			}
			if (outcome.kind !== "kept") return;
			if (++replays > MAX_REPLAYS) {
				rebaser.giveUp(outcome.current);
				replays = 0;
			} else rebaser.rebase(outcome.current);
		}
	}

	/** A file the door's `createFile` made: created at the path; one Sync brought meanwhile is read instead. */
	private async create(path: string): Promise<void> {
		const { replica, log, vault } = this.deps;
		const { tasks, history, ids } = replica.state;
		if (tasks === null) return;
		const seq = log.lastSeq;
		try {
			await vault.create(path, tasks);
			log.persisted(tasks, history, ids, seq);
		} catch (e) {
			const found = await vault.read(path);
			if (found === null) throw e;
			this.deps.rebaser.rebase(found);
		}
	}
}

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
	/** A write or read failed for a reason of its own (the disk, a missing folder): told once per failure. */
	readonly failed: (error: unknown) => void;
}

/** How a drain ended: nothing left to write, the file left (the settings name another), or a failure. */
type DrainEnd = "done" | "away";

/**
 * The tasks text's persistence (P3): one serial queue writing the replica's text over the base it was made from, compared
 * and set inside `vault.process`, so an outside write landing between the base and the write is never overwritten: the
 * file becomes the new base and the pending calls replay over it, at most twice a write. It also reads the file when it
 * changes elsewhere (our own echo finds the base and does nothing; a read overtaken by a newer read or a write lands
 * nowhere), creates a missing file, and drops the pending calls when the file goes. A write that fails waits for the next
 * call, file event or settings change, told once; it never retries on its own. It outlives the plugin object until
 * nothing more can be written (`drained`).
 */
export class TasksWriter {
	private running: Promise<void> | null = null;
	private recheck = false;
	private watched: string | null = null;
	/** Bumped by every read started and every base a write or a replay set: a read lands only while it is the newest. */
	private generation = 0;
	/** Which file the queue writes: bumped whenever the file goes or another is read; a write that landed under an older one is thrown away. */
	private epoch = 0;
	/** The write failure the queue waits on; null while it writes freely. */
	private failure: unknown = null;
	/** A read failure, told once until a read works again: it never stops the writes. */
	private readFailure: unknown = null;
	private recheckFirst = false;

	constructor(private readonly deps: TasksWriterDeps) {}

	/** What the queue is stuck on (it waits for a call, a file event or a settings change to try again); null for nothing. */
	get stuck(): unknown {
		return this.failure;
	}

	/** The file at the path read: the replica's base (the first build, and a new `tasksFile`). A read that fails throws. */
	async load(): Promise<void> {
		this.epoch++;
		this.watched = this.deps.path();
		await this.readOutside(true);
	}

	/** The settings changed: another tasks file is like a file that has gone, then the new one is read; the same one, a retry. */
	async follow(): Promise<void> {
		const old = this.watched;
		if (this.deps.path() === old) {
			if (this.failure !== null) this.schedule();
			return;
		}
		if (old !== null) this.gone(old);
		await this.load();
	}

	watch(): () => void {
		return this.deps.vault.watch((change) => this.changed(change));
	}

	/** The replica's text or log changed: a write is queued unless one runs, which picks it up. */
	schedule(): void {
		if (this.running) return;
		let end: DrainEnd | "failed" = "failed";
		this.running = this.drain()
			.then((how) => {
				end = how;
			})
			.catch((e: unknown) => this.fail(e))
			.finally(() => {
				this.running = null;
				if (this.recheck) {
					const first = this.recheckFirst;
					this.recheck = this.recheckFirst = false;
					this.readOutside(first).catch((e: unknown) => this.readFailed(e));
				}
				if (end === "done" && this.dirty) this.schedule();
			});
	}

	/** Resolves once nothing more can be written now: everything landed, or the queue waits on a failure (`stuck`). */
	async drained(): Promise<void> {
		while (this.running) await this.running;
	}

	/** Something to write: the replica's text is not the file's, or calls are in the log. */
	private get dirty(): boolean {
		const tasks = this.deps.replica.state.tasks;
		return this.watched !== null && tasks !== null && (tasks !== this.deps.log.base.text || this.deps.log.size > 0);
	}

	private fail(error: unknown): void {
		if (this.failure === null) this.deps.failed(error);
		this.failure = error;
	}

	private readFailed(error: unknown): void {
		if (this.readFailure === null) this.deps.failed(error);
		this.readFailure = error;
	}

	/** The file went: the pending calls drop, and nothing under way for it lands any more. */
	private gone(path: string): void {
		this.epoch++;
		this.generation++;
		this.deps.rebaser.gone(path);
	}

	private adopt(text: string): void {
		this.generation++;
		this.deps.rebaser.rebase(text);
		this.schedule();
	}

	private changed(change: VaultChange): void {
		const path = this.watched;
		if (path === null) return;
		const left = (change.kind === "rename" && change.oldPath === path) || (change.kind === "delete" && change.path === path);
		if (!left && change.path !== path) return;
		if (this.running) this.recheck = true;
		else this.readOutside().catch((e: unknown) => this.readFailed(e));
	}

	/**
	 * The file read: our own echo or nothing new (a retry of a write that waits), a new base, or gone (told on a first read
	 * too). A read that fails throws; it lands nowhere once a newer read, a write or another file came.
	 */
	private async readOutside(first = false): Promise<void> {
		const path = this.watched;
		if (path === null) return;
		const ticket = ++this.generation;
		const text = await this.deps.vault.read(path);
		if (ticket !== this.generation || path !== this.watched) return;
		this.readFailure = null;
		if (this.running) {
			this.recheck = true;
			this.recheckFirst ||= first;
			return;
		}
		if (text === this.deps.log.base.text && !(first && text === null)) {
			if (this.dirty) this.schedule();
			return;
		}
		if (text === null) this.gone(path);
		else this.adopt(text);
	}

	private async drain(): Promise<DrainEnd> {
		let replays = 0;
		for (;;) {
			const path = this.watched;
			const epoch = this.epoch;
			const { log, replica, rebaser } = this.deps;
			if (path === null || !this.dirty) return "done";
			const state = replica.state;
			if (state.tasks === log.base.text) {
				log.persisted(state.tasks!, state.history, state.ids, log.lastSeq);
				continue;
			}
			if (log.base.text === null) {
				if (!(await this.create(path, epoch))) return "away";
				continue;
			}
			const write: { taken: { readonly state: typeof replica.state; readonly seq: number } | null; away: boolean } = { taken: null, away: false };
			const outcome = await this.deps.vault.write(path, (current) => {
				if (this.deps.path() !== path) {
					write.away = true;
					return null;
				}
				const now = replica.state;
				if (current !== log.base.text || now.tasks === null) return null;
				write.taken = { state: now, seq: log.lastSeq };
				return now.tasks;
			});
			if (write.away || epoch !== this.epoch) return "away";
			if (outcome.kind === "moved" || outcome.kind === "missing") {
				this.gone(path);
				return "away";
			}
			this.generation++;
			if (outcome.kind === "written" && write.taken !== null) {
				const { state: taken, seq } = write.taken;
				log.persisted(taken.tasks!, taken.history, taken.ids, seq);
				this.failure = null;
				replays = 0;
				continue;
			}
			if (outcome.kind !== "kept") return "done";
			if (++replays > MAX_REPLAYS) {
				rebaser.giveUp(outcome.current);
				replays = 0;
			} else rebaser.rebase(outcome.current);
		}
	}

	/**
	 * A file the door's `createFile` made: created at the path; one Sync brought meanwhile is read instead. False when the
	 * file changed under it (another `tasksFile`): what it made lands nowhere.
	 */
	private async create(path: string, epoch: number): Promise<boolean> {
		const { replica, log, vault } = this.deps;
		const { tasks, history, ids } = replica.state;
		if (tasks === null) return true;
		const seq = log.lastSeq;
		try {
			await vault.create(path, tasks);
			if (epoch !== this.epoch) return false;
			log.persisted(tasks, history, ids, seq);
			this.failure = null;
		} catch (e) {
			const found = await vault.read(path);
			if (epoch !== this.epoch) return false;
			if (found === null) throw e;
			this.generation++;
			this.deps.rebaser.rebase(found);
		}
		return true;
	}
}

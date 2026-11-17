import type { UndoOutcome, UndoService } from "./contracts";
import type { TaskFileStore } from "./ports";
import { UndoSteps, type UndoWay } from "./UndoSteps";
import type { PatchIds } from "../domain/TextPatch";
import type { TaskIdentity } from "./TaskIdentity";

/** Consecutive writes joined into one step: the text before the first, the text after the last. */
interface Joined {
	readonly before: string;
	readonly beforeIds?: PatchIds["before"];
	readonly after: string;
	readonly afterIds?: PatchIds["after"];
}

/** The tasks file's changes the plugin made, kept while it runs: each step back takes one back over the file as it is now. */
export class UndoHistory implements UndoService {
	private readonly steps = new UndoSteps();
	private readonly listeners = new Set<() => void>();
	/** While `together` runs: the writes joined so far, from the first one's before to the last one's after. */
	private joined: { run: Joined | null } | null = null;

	/** `identity`, the tasks' identity the task service keeps: a step gives each task it brings back the id it had. */
	constructor(
		private readonly store: TaskFileStore,
		private readonly identity: TaskIdentity | null = null,
	) {}

	/** A change the plugin just made: a new step, and nothing left to do again. `ids`, who the tasks were on each side. */
	record(before: string, after: string, ids?: PatchIds): void {
		if (this.joined) {
			const run = this.joined.run;
			if (run && run.after === before) this.joined.run = { ...run, after, afterIds: ids?.after };
			else {
				this.close();
				this.joined.run = { before, beforeIds: ids?.before, after, afterIds: ids?.after };
			}
			return;
		}
		if (this.steps.record(before, after, ids)) this.emit();
	}

	/**
	 * The changes `work` makes, one step to take back: an action made of several writes (Best task's label moved). Only
	 * writes that follow each other join: a change from outside in between (by hand, Sync) closes the step so far, and the
	 * next write starts another, so the outside change is never taken back with them.
	 */
	async together<R>(work: () => Promise<R>): Promise<R> {
		if (this.joined) return work();
		this.joined = { run: null };
		try {
			return await work();
		} finally {
			this.close();
			this.joined = null;
		}
	}

	/** The writes joined so far, made one step. */
	private close(): void {
		const run = this.joined?.run;
		if (!this.joined || !run) return;
		this.joined.run = null;
		const ids = run.beforeIds && run.afterIds ? { before: run.beforeIds, after: run.afterIds } : undefined;
		if (this.steps.record(run.before, run.after, ids)) this.emit();
	}

	undo(): Promise<UndoOutcome> {
		return this.step("undo");
	}

	redo(): Promise<UndoOutcome> {
		return this.step("redo");
	}

	canUndo(): boolean {
		return this.steps.canUndo();
	}

	canRedo(): boolean {
		return this.steps.canRedo();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** A step whose lines were edited since can't be made: it is dropped, and the file stays as it is. */
	private async step(way: UndoWay): Promise<UndoOutcome> {
		if (!(way === "undo" ? this.steps.canUndo() : this.steps.canRedo())) return "nothing";
		let outcome: UndoOutcome = "nothing";
		await this.store.write((text) => {
			const made = this.steps.step(way, text);
			outcome = made.outcome;
			if (made.carried) this.identity?.carried(text, made.text, made.carried);
			return made.text;
		});
		this.emit();
		return outcome;
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

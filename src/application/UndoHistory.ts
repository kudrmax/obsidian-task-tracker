import type { UndoOutcome, UndoService } from "./contracts";
import type { TaskFileStore } from "./ports";
import { UndoSteps, type UndoWay } from "./UndoSteps";

/** The tasks file's changes the plugin made, kept while it runs: each step back takes one back over the file as it is now. */
export class UndoHistory implements UndoService {
	private readonly steps = new UndoSteps();
	private readonly listeners = new Set<() => void>();

	constructor(private readonly store: TaskFileStore) {}

	/** A change the plugin just made: a new step, and nothing left to do again. */
	record(before: string, after: string): void {
		if (this.steps.record(before, after)) this.emit();
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
			return made.text;
		});
		this.emit();
		return outcome;
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

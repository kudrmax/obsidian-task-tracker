import { TextPatch } from "../domain/TextPatch";
import type { UndoOutcome, UndoService } from "./contracts";
import type { TaskFileStore } from "./ports";

/** The steps kept: enough to go back over an evening's work, not the whole day's. */
const DEPTH = 100;

/** The tasks file's changes the plugin made, as patches: each step back takes one back over the file as it is now. */
export class UndoHistory implements UndoService {
	private readonly done: TextPatch[] = [];
	private readonly undone: TextPatch[] = [];
	private readonly listeners = new Set<() => void>();

	constructor(private readonly store: TaskFileStore) {}

	/** A change the plugin just made: a new step, and nothing left to do again. */
	record(before: string, after: string): void {
		const patch = TextPatch.between(before, after);
		if (patch.empty) return;
		this.done.push(patch);
		if (this.done.length > DEPTH) this.done.shift();
		this.undone.length = 0;
		this.emit();
	}

	undo(): Promise<UndoOutcome> {
		return this.step(this.done, this.undone, (patch, text) => patch.revert(text));
	}

	redo(): Promise<UndoOutcome> {
		return this.step(this.undone, this.done, (patch, text) => patch.apply(text));
	}

	canUndo(): boolean {
		return this.done.length > 0;
	}

	canRedo(): boolean {
		return this.undone.length > 0;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** A step whose lines were edited since can't be made: it is dropped, and the file stays as it is. */
	private async step(from: TextPatch[], to: TextPatch[], make: (patch: TextPatch, text: string) => string | null): Promise<UndoOutcome> {
		const patch = from.pop();
		if (!patch) return "nothing";
		let made = false;
		await this.store.write((text) => {
			const next = make(patch, text);
			made = next !== null;
			return next ?? text;
		});
		if (made) to.push(patch);
		this.emit();
		return made ? "done" : "conflict";
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

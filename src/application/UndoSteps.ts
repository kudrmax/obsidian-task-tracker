import { type Hunk, TextPatch } from "../domain/TextPatch";
import type { UndoOutcome } from "./contracts";

/** The steps kept: enough to go back over an evening's work, not the whole day's. */
const DEPTH = 100;

/** The steps as plain data: each a patch's changed blocks, the last one the next to take back or do again. */
export interface UndoState {
	readonly done: readonly (readonly Hunk[])[];
	readonly undone: readonly (readonly Hunk[])[];
}

export type UndoWay = "undo" | "redo";

/**
 * The plugin's own changes of the tasks file as patches, one step per action: each step back is taken back over the file
 * as it is now, so edits by hand since stay. UndoHistory keeps them while the plugin runs; the phone's door hands them
 * back and forth as `UndoState`.
 */
export class UndoSteps {
	private readonly done: TextPatch[];
	private readonly undone: TextPatch[];

	constructor(state: UndoState = { done: [], undone: [] }) {
		this.done = state.done.map((h) => TextPatch.of(h));
		this.undone = state.undone.map((h) => TextPatch.of(h));
	}

	get state(): UndoState {
		return { done: this.done.map((p) => p.hunks), undone: this.undone.map((p) => p.hunks) };
	}

	/** A change just made: a new step, and nothing left to do again. False when it changed no line. */
	record(before: string, after: string): boolean {
		const patch = TextPatch.between(before, after);
		if (patch.empty) return false;
		this.done.push(patch);
		if (this.done.length > DEPTH) this.done.shift();
		this.undone.length = 0;
		return true;
	}

	canUndo(): boolean {
		return this.done.length > 0;
	}

	canRedo(): boolean {
		return this.undone.length > 0;
	}

	/** The next step that way, taken off; null when there is none. */
	private take(way: UndoWay): TextPatch | null {
		return (way === "undo" ? this.done : this.undone).pop() ?? null;
	}

	/** `text` with the step taken back or done again; null when its lines were edited since. */
	private static make(way: UndoWay, patch: TextPatch, text: string): string | null {
		return way === "undo" ? patch.revert(text) : patch.apply(text);
	}

	/** A step made: it can be made the other way now. A step that could not be made is dropped. */
	private made(way: UndoWay, patch: TextPatch): void {
		(way === "undo" ? this.undone : this.done).push(patch);
	}

	/** A whole step over `text`, at once: the outcome and the text it leaves. */
	step(way: UndoWay, text: string): { readonly outcome: UndoOutcome; readonly text: string } {
		const patch = this.take(way);
		if (!patch) return { outcome: "nothing", text };
		const next = UndoSteps.make(way, patch, text);
		if (next === null) return { outcome: "conflict", text };
		this.made(way, patch);
		return { outcome: "done", text: next };
	}
}

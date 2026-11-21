import type { UndoOutcome } from "./contracts";

/** What a notice says after a step back (`undo`) or forward came out as `outcome`; null: nothing to say. */
export function undoNotice(step: "undo" | "redo", outcome: UndoOutcome): string | null {
	if (outcome !== "conflict") return null;
	return step === "undo" ? "Can’t undo: the tasks file changed" : "Can’t redo: the tasks file changed";
}

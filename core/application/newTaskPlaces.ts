import type { Placement } from "../domain/Placement";
import { sameSlot } from "../domain/Task";
import type { NewTaskPlace, TaskKey } from "./contracts";
import { keyId } from "./taskKeys";

function sameKey(a: TaskKey | null, b: TaskKey | null): boolean {
	return a === null || b === null ? a === b : keyId(a) === keyId(b);
}

function samePlacement(a: Placement | undefined, b: Placement | undefined): boolean {
	if (a === undefined || b === undefined) return a === b;
	return a.kind === b.kind && (a.kind !== "date" || (b.kind === "date" && a.date === b.date));
}

/**
 * The same place for a new task, field by field (never by the text of its JSON, whose key order a host may change): the
 * same kind, list or day, section, task it stands before (by its key as read), date, parent, slot, placement and node.
 */
export function sameNewPlace(a: NewTaskPlace, b: NewTaskPlace): boolean {
	switch (a.kind) {
		case "list":
			return b.kind === "list" && a.list === b.list && a.group === b.group && a.date === b.date && sameKey(a.before, b.before);
		case "day":
			return b.kind === "day" && a.date === b.date && a.group === b.group && sameKey(a.before, b.before);
		case "subtask":
			return b.kind === "subtask" && sameKey(a.parent, b.parent) && sameKey(a.before, b.before);
		case "slot":
			return b.kind === "slot" && sameSlot(a.slot, b.slot);
		case "projects":
			return b.kind === "projects" && a.group === b.group && a.node === b.node && sameKey(a.before, b.before) && samePlacement(a.placement, b.placement);
	}
}

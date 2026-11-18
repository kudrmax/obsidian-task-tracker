import { arrayMove } from "@dnd-kit/sortable";
import type { Row } from "../port";

/**
 * Subtask depth while a card is carried, as dnd-kit's «Sortable tree» example computes it (`getProjection` in its
 * `utilities.ts`): the card goes one level deeper for every indent the pointer moved right since the lift, one shallower
 * for every indent left, and never deeper than one under the row above it nor shallower than the row below it. A section's
 * header bounds a level like the list's edge: right under it a card is a task, not a subtask.
 */

/** The depth a section header stands for: under it no card can be a subtask. */
const HEADER = -1;

const depthOf = (row: Row): number => (row.kind === "task" ? row.depth : HEADER);

/**
 * The depth the carried card `activeId` takes when it stands where `overId` is now, moved `offsetX` pixels sideways
 * since the lift; `liftedDepth` is its depth when lifted (the example's `activeItem.depth`, from the tree before the drag);
 * `indent` is one level's width.
 */
export function projectDepth(rows: readonly Row[], activeId: string, overId: string, offsetX: number, indent: number, liftedDepth: number): number {
	const from = rows.findIndex((row) => row.id === activeId);
	if (from < 0) return 0;
	const found = rows.findIndex((row) => row.id === overId);
	const to = found < 0 ? from : found;
	const moved = arrayMove([...rows], from, to);
	const before = moved[to - 1];
	const after = moved[to + 1];
	const wanted = liftedDepth + Math.round(offsetX / indent);
	const deepest = before ? depthOf(before) + 1 : 0;
	const shallowest = after ? Math.max(0, depthOf(after)) : 0;
	return Math.max(shallowest, Math.min(wanted, Math.max(0, deepest)));
}

/** The rows under `id` (its subtasks, theirs…): they fold away while it is carried and travel with it. */
export function descendantsOf(rows: readonly Row[], id: string): ReadonlySet<string> {
	const at = rows.findIndex((row) => row.id === id);
	const out = new Set<string>();
	if (at < 0) return out;
	const top = depthOf(rows[at]);
	for (let i = at + 1; i < rows.length && depthOf(rows[i]) > top; i++) out.add(rows[i].id);
	return out;
}

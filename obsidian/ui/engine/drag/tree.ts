import { arrayMove } from "@dnd-kit/sortable";
import type { Row } from "../port";

/**
 * Subtask level while a card is carried (Max, 2026-11-18): by how far the pointer moved sideways since the card was taken,
 * as dnd-kit's «Sortable tree» example projects it, with a coarser step and a sticky edge. Every `SHIFT_STEP` pixels to
 * the right is one level deeper, to the left one shallower; a level once taken holds until the hand comes back to within
 * `SHIFT_BACK` pixels of where the previous one held, so a hand resting near an edge never makes the level flicker.
 */
export const SHIFT_STEP = 40;
export const SHIFT_BACK = 15;

/** The levels moved, deeper positive, for a sideways move of `offset` pixels, given the levels moved a moment before. */
export function stickyShift(previous: number, offset: number, step = SHIFT_STEP, back = SHIFT_BACK): number {
	let shift = previous;
	while (offset >= (shift + 1) * step) shift++;
	while (offset <= (shift - 1) * step) shift--;
	while (shift > 0 && offset < (shift - 1) * step + back) shift--;
	while (shift < 0 && offset > (shift + 1) * step - back) shift++;
	return shift;
}

/** The depth a section header stands for: under it no card can be a subtask. */
const HEADER = -1;

const depthOf = (row: Row): number => (row.kind === "task" ? row.depth : HEADER);

/** Where a card stands in a list's order of rows: the section it is in (null: none), and the task right after it (null: none, it ends its section). */
export interface Slot {
	readonly section: string | null;
	readonly before: string | null;
}

/**
 * The slot of `id` in `order` (a list's row ids, `id` among them), by the rows around it: the section of the header (or
 * the empty section's plate) above it, and the task right below it, if a task comes before the next header.
 */
export function slotOf(rows: readonly Row[], order: readonly string[], id: string): Slot {
	const kinds = new Map(rows.map((row) => [row.id, row]));
	const at = order.indexOf(id);
	let section: string | null = null;
	for (let i = at - 1; i >= 0; i--) {
		const row = kinds.get(order[i]);
		if (row?.kind === "section") {
			section = row.id;
			break;
		}
		if (row?.kind === "empty") {
			section = row.section;
			break;
		}
	}
	const next = at >= 0 ? kinds.get(order[at + 1] ?? "") : undefined;
	return { section, before: next?.kind === "task" ? next.id : null };
}

/** The level a card asking for `wanted` takes between the row `above` and the row `below` its place. */
export function levelBetween(above: Row | undefined, below: Row | undefined, wanted: number): number {
	const deepest = above ? Math.max(0, depthOf(above) + 1) : 0;
	const shallowest = below ? Math.max(0, depthOf(below)) : 0;
	return Math.max(shallowest, Math.min(deepest, Math.max(0, wanted)));
}

/** The level the carried card `activeId` takes when it stands where `overId` is now, asking for `wanted`. */
export function levelAt(rows: readonly Row[], activeId: string, overId: string, wanted: number): number {
	const from = rows.findIndex((row) => row.id === activeId);
	if (from < 0) return 0;
	const found = rows.findIndex((row) => row.id === overId);
	const to = found < 0 ? from : found;
	const moved = arrayMove([...rows], from, to);
	return levelBetween(moved[to - 1], moved[to + 1], wanted);
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

import { arrayMove } from "@dnd-kit/sortable";
import type { Row } from "../port";

/**
 * Subtask level while a card is carried (Max, 2026-11-18): where the pointer stands across the list decides it. In the
 * right third of the list the card is a subtask, one level under the task above its place; in the left two thirds it is
 * as shallow as its place allows (a task, or a sibling of the subtasks below it).
 */

/** From this share of the list's width on, the card is a subtask. */
export const SUBTASK_FROM = 2 / 3;

export type Zone = "task" | "subtask";

/** Which zone of a list (left edge `left`, `width` wide) the pointer at `x` is in. */
export function zoneOf(x: number, left: number, width: number): Zone {
	return x >= left + width * SUBTASK_FROM ? "subtask" : "task";
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

/** The level a card takes in `zone` between the row `above` and the row `below` its place. */
export function levelBetween(above: Row | undefined, below: Row | undefined, zone: Zone): number {
	const deepest = above ? Math.max(0, depthOf(above) + 1) : 0;
	const shallowest = below ? Math.max(0, depthOf(below)) : 0;
	return zone === "subtask" ? Math.max(shallowest, deepest) : Math.min(shallowest, deepest);
}

/** The level the carried card `activeId` takes when it stands where `overId` is now, the pointer in `zone`. */
export function levelAt(rows: readonly Row[], activeId: string, overId: string, zone: Zone): number {
	const from = rows.findIndex((row) => row.id === activeId);
	if (from < 0) return 0;
	const found = rows.findIndex((row) => row.id === overId);
	const to = found < 0 ? from : found;
	const moved = arrayMove([...rows], from, to);
	return levelBetween(moved[to - 1], moved[to + 1], zone);
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

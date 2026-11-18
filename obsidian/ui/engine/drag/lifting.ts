import type { DropColumn } from "../../../../core/application/contracts";
import type { ScreenState } from "../screenStore";
import type { Lifted } from "./dragState";
import { listCards } from "./listDrag";

/** Layers a carried task with subtasks draws under its card. */
const STACK_LAYERS = 2;

/**
 * A task's card lifted from its list: the task with every subtask under it, and its place there as the core's gap (its
 * index among the cards left, its depth, its section), where the gap stays until the finger aims elsewhere.
 */
export function liftCard(state: ScreenState, column: DropColumn, id: string): Lifted | null {
	const model = state.columns[column];
	const item = state.items[id];
	if (!item) return null;
	for (const group of model.groups) {
		const at = group.rows.findIndex((row) => row.id === id);
		if (at < 0) continue;
		const level = group.rows[at].level;
		let end = at + 1;
		while (end < group.rows.length && group.rows[end].level > level) end++;
		const ids = group.rows.slice(at, end).map((row) => row.id);
		const index = listCards(model, state.items, new Set()).findIndex((card) => card.id === id);
		return { kind: "task", id, key: item.key, from: column, ids, home: { column, gap: { kind: "gap", index, level, group: group.name } }, layers: ids.length > 1 ? STACK_LAYERS : 0 };
	}
	return null;
}

/** A task's block lifted from the timeline: it has no place in a list to come back to. */
export function liftBlock(state: ScreenState, id: string): Lifted | null {
	const item = state.items[id];
	return item ? { kind: "task", id, key: item.key, from: "timeline", ids: [id], home: null, layers: 0 } : null;
}

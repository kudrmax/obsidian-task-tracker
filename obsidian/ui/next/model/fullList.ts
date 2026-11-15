import { type BlockModel, rowVars, today } from "./block";
import { fullLayer, fullTree } from "./full";
import { funnelList, type ListModel } from "./lists";

/** The full card's rows are keyed apart from the block's (`full/<id>`): the same task stands in both, each its own row. */
export const FULL_ROW = "full/";

/**
 * The subtasks on the full card, as the list draws them (every subtask, done ones in place); read by the block's filter,
 * they show no folder over a block fixed to their project (`fullNeeds`).
 */
export function fullList(model: BlockModel): ListModel | null {
	const layer = fullLayer(model.layers);
	const tree = layer && !layer.closing ? fullTree(model.answers) : null;
	if (!layer || !tree || tree.task.id !== layer.id) return null;
	const listed = funnelList({ items: tree.subtasks, day: today(model), grouped: false, sections: [], ungrouped: "", plate: null, emptyLabel: "", column: "day" });
	return {
		...listed,
		rows: listed.rows.map((row) => (row.kind === "card" ? { ...row, key: `${FULL_ROW}${row.key}` } : row)),
	};
}

/** The variables of the full card's rows (their levels, their branches' lines). */
export function fullRowVars(model: BlockModel): ReadonlyMap<string, Readonly<Record<string, string>>> {
	const list = fullList(model);
	return list ? rowVars({ kind: "byProject", context: "full", list }) : new Map();
}

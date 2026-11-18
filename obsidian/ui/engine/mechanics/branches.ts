/** A subtask's lines to its task: whether a sibling follows it (else its line bends in), and for each level above it, outermost first, whether that level's line runs on past it. */
export interface Branch {
	readonly last: boolean;
	readonly through: readonly boolean[];
}

/** The lines of the row at `index` among rows of these `depths` in drawn order; null for a task (depth 0). */
export function branchAt(depths: readonly number[], index: number): Branch | null {
	const depth = depths[index];
	if (depth <= 0) return null;
	/** A level's line runs on past this row when the next row at that level or shallower is at that very level. */
	const runsOn = (level: number) => {
		for (let i = index + 1; i < depths.length; i++) if (depths[i] <= level) return depths[i] === level;
		return false;
	};
	return { last: !runsOn(depth), through: Array.from({ length: depth - 1 }, (_, k) => runsOn(k + 1)) };
}

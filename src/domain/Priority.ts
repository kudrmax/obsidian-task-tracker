/** The fixed set of colours a priority level takes; the order the settings offer them in. */
export const PRIORITY_COLORS = ["red", "orange", "yellow", "green", "teal", "blue"] as const;
export type PriorityColor = (typeof PRIORITY_COLORS)[number];

/** A priority level: a task whose text starts with `prefix` gets the tint of `color`. */
export interface PriorityLevel {
	readonly prefix: string;
	readonly color: PriorityColor;
}

/** A prefix marks a task only when it is one word: a line's first word is matched against it. */
export function usablePrefix(prefix: string): boolean {
	return /^\S+$/.test(prefix);
}

export function sameLevels(a: readonly PriorityLevel[], b: readonly PriorityLevel[]): boolean {
	return a.length === b.length && a.every((level, i) => level.prefix === b[i].prefix && level.color === b[i].color);
}

/** The levels that mark tasks: a one-word prefix, the first of two with the same one. */
export function usableLevels(levels: readonly PriorityLevel[]): readonly PriorityLevel[] {
	return levels.filter((level, i) => usablePrefix(level.prefix) && levels.findIndex((l) => l.prefix === level.prefix) === i);
}

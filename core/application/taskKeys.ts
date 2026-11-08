import type { TaskKey } from "./contracts";

/** The same place in the file: section, index and path. Two reads of one place match even when its line changed. */
export function samePlace(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
}

/** A string that names a place in the file: equal for keys `samePlace` calls the same, whatever their lines. */
export function placeId(key: TaskKey): string {
	return `${key.section}:${key.index}:${key.path.join(".")}`;
}

/** The same line as read, wherever it stands. */
export function sameLine(a: TaskKey, b: TaskKey): boolean {
	return a.raw === b.raw;
}

/** One task of a list with its subtasks: the same section and index, whichever of its subtasks each names. */
export function sameTaskTree(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index;
}

/** A string that names the task as read: equal for equal keys, raw line included. */
export function keyId(key: TaskKey): string {
	return `${key.section}:${key.index}:${key.path.join(".")}:${key.raw}`;
}

/** `a` sits under `b`, at any depth. */
export function isUnder(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index && b.path.length < a.path.length && b.path.every((i, k) => a.path[k] === i);
}

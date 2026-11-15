import type { TaskEntry } from "../domain/TaskDocument";
import type { TaskKey } from "./contracts";

/** The key of a task as read: its place and line, and its id, which names it after writes moved its place. */
export function keyOf(entry: TaskEntry): TaskKey {
	return { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw, id: entry.id };
}

/** A task's key as the core gives it (`TaskKey`): a section, a place and a line. */
export function isTaskKey(value: unknown): value is TaskKey {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.section === "string" && typeof v.index === "number" && Array.isArray(v.path) && typeof v.raw === "string";
}

/** The same place in the file: section, index and path. Two reads of one place match even when its line changed. */
export function samePlace(a: TaskKey, b: TaskKey): boolean {
	return a.section === b.section && a.index === b.index && a.path.length === b.path.length && a.path.every((i, k) => b.path[k] === i);
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

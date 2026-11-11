import { usablePrefix } from "./Priority";
import { isOpen } from "./Task";
import type { TaskDocument, TaskEntry } from "./TaskDocument";

/** The mark a result's line starts with before the settings say otherwise. */
export const DEFAULT_RESULT_MARK = "🎯";

/**
 * The mark that makes a task a result: one word, and not a priority's prefix (a line's first word would then mean both).
 * Null when `mark` can't be one: no task is read as a result.
 */
export function usableResultMark(mark: string, prefixes: readonly string[]): string | null {
	return usablePrefix(mark) && !prefixes.includes(mark) ? mark : null;
}

const FIRST_WORD_RE = /^(\S+)\s+(.*)$/s;

/**
 * Whether a text starts with the result mark, a whole word with whitespace after it, and the text after that whitespace.
 * Any other text is no result's and stays as it is; so does the mark alone, which is a title of its own.
 */
export function resultOfText(text: string, mark: string | null): { readonly result: boolean; readonly text: string } {
	const m = mark === null ? null : FIRST_WORD_RE.exec(text);
	if (!m || m[1] !== mark) return { result: false, text };
	return { result: true, text: m[2] };
}

/**
 * A typed title without the result mark it starts with, the rest as typed: the mark alone is a title of nothing, as a
 * priority's prefix alone.
 */
export function withoutResultMark(text: string, mark: string | null): string {
	if (mark !== null && text.trim() === mark) return "";
	return resultOfText(text.trimStart(), mark).text;
}

/** The step a result shows: its first open subtask, then that one's first open subtask, and so on down; null when none is open. */
export function nextStep(entry: TaskEntry): TaskEntry | null {
	let step: TaskEntry | null = null;
	for (let at = entry; ; ) {
		const open = at.subtasks.find((sub) => isOpen(sub.task.status));
		if (!open) return step;
		step = at = open;
	}
}

/** The result a task is a step of: the nearest task above it that is a result; null for none. */
export function resultAbove(doc: TaskDocument, entry: TaskEntry): TaskEntry | null {
	for (let depth = entry.path.length - 1; depth >= 0; depth--) {
		const above = doc.find(entry.section, entry.index, entry.path.slice(0, depth));
		if (above?.task.result) return above;
	}
	return null;
}

/** `outer` is `inner` or holds it among its subtasks, at any depth. */
export function holds(outer: TaskEntry, inner: TaskEntry): boolean {
	return outer.section === inner.section && outer.index === inner.index && outer.path.length <= inner.path.length && outer.path.every((i, k) => inner.path[k] === i);
}

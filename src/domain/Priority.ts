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

const FIRST_WORD_RE = /^(\S+)\s+(.*)$/;

/**
 * The level a text starts with: its first word when that is one of `prefixes` and whitespace follows it; the text is
 * what comes after that whitespace. Any other text has none and stays as it is.
 */
export function priorityOfText(text: string, prefixes: readonly string[]): { priority: string | null; text: string } {
	const m = FIRST_WORD_RE.exec(text);
	if (!m || !prefixes.includes(m[1])) return { priority: null, text };
	return { priority: m[1], text: m[2] };
}

/** Nothing to write: no text, or a level's prefix with nothing after it. */
export function isBlankTitle(text: string, prefixes: readonly string[]): boolean {
	return priorityOfText(text, prefixes).text.trim() === "";
}

/** `text` with `prefix` first in place of the one it had; null takes it off. */
export function withPriority(text: string, prefix: string | null, prefixes: readonly string[]): string {
	const rest = priorityOfText(text, prefixes).text;
	return prefix === null ? rest : `${prefix} ${rest}`;
}

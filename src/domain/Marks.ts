import { priorityOfText } from "./Priority";

/** What tints a task: a priority level's prefix or the labels' names. */
export interface Marks {
	readonly priority: string | null;
	readonly labels: readonly string[];
}

/** What a task may be given next. */
export interface MarkChoices {
	readonly priority: boolean;
	readonly labels: boolean;
}

/** A priority or labels, never both: the priority wins, as it tints the card of a line written with both. */
export function marksOf(priority: string | null, labels: readonly string[]): Marks {
	return { priority, labels: priority === null ? labels : [] };
}

/** A priority while the task has no labels, labels while it has no priority. */
export function markChoices(marks: Marks): MarkChoices {
	return { priority: marks.labels.length === 0, labels: marks.priority === null };
}

/**
 * A title typed with a priority and labels chosen for it, as it is written: the chosen priority, else the level its first
 * word is (the text then goes without that word); the labels while there is no priority.
 */
export function typedMarks(text: string, priority: string | null, labels: readonly string[], prefixes: readonly string[]): Marks & { readonly text: string } {
	const typed = priority === null ? priorityOfText(text, prefixes) : { text, priority };
	return { text: typed.text, ...marksOf(typed.priority, labels) };
}

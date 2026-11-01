import type { TaskEntry } from "./TaskDocument";

const INDENT_RE = /^[ \t]*/;

function indentOf(line: string): string {
	return INDENT_RE.exec(line)![0];
}

/** A task's own nested lines without a checkbox, raw, in file order: the lines of its subtasks, theirs included, are left out. */
export function descriptionLines(entry: TaskEntry): readonly string[] {
	const lines: string[] = [];
	const children = entry.task.children;
	let next = 0;
	for (let i = 0; i < children.length; i++) {
		const sub = entry.subtasks[next];
		if (sub && children[i] === sub.raw) {
			i += sub.task.children.length;
			next++;
		} else lines.push(children[i]);
	}
	return lines;
}

/** The indent the description's first level has in the file; null without a description. */
export function descriptionIndent(entry: TaskEntry): string | null {
	const lines = descriptionLines(entry);
	if (lines.length === 0) return null;
	return lines.map(indentOf).reduce((a, b) => (b.length < a.length ? b : a));
}

/** The description as Markdown: its lines with the indent of its first level taken off; null without one. */
export function descriptionMarkdown(entry: TaskEntry): string | null {
	const indent = descriptionIndent(entry);
	if (indent === null) return null;
	return descriptionLines(entry)
		.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()))
		.join("\n");
}

/** The lines Markdown makes in a task: blank ones would end the task in the file, so they go. */
export function markdownLines(markdown: string): readonly string[] {
	return markdown.split(/\r?\n/).filter((line) => line.trim() !== "");
}

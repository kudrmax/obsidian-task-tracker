/** A line break of any kind and the spaces around it: a task is one line of the file, so in a title it reads as one space. */
export const LINE_BREAK = /\s*(?:\r\n|[\n\r\u2028\u2029])\s*/gu;

/** The text on one line, the rest as typed: what a title field shows while it is being typed. */
export function oneLine(text: string): string {
	return text.replace(LINE_BREAK, " ");
}

/**
 * What makes a line a list item, a checkbox, a heading or a quote, at a title's start, as many as there are: `- [ ] `,
 * `* `, `1. `, `[x] `, `## `, `> `. A tag (`#home`) and inline marks (`**bold**`, links) are not.
 */
const LINE_MARKERS = /^(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?|\[.\]\s+|#{1,6}\s+|>\s*)+/u;

/** The title a task line gets: on one line, trimmed, without a list, checkbox, heading or quote marker at its start. */
export function taskTitle(text: string): string {
	return oneLine(text).trim().replace(LINE_MARKERS, "").trim();
}

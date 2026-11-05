export interface Found {
	readonly start: number;
	readonly end: number;
}

export interface TextHit {
	readonly before: string;
	readonly match: string;
	readonly after: string;
}

/** How much of the text before a match a snippet keeps. */
const SNIPPET_LEAD = 24;
const ELLIPSIS = "…";

/** Letters compared as the eye reads them: case aside, «ё» as «е». Keeps the length, so indexes stay the text's own. */
function folded(text: string): string {
	return text.toLowerCase().replace(/ё/g, "е");
}

/** The first place the query stands in the text; nothing for a query of spaces. */
export function findIn(text: string, query: string): Found | null {
	const needle = folded(query.trim());
	if (needle.length === 0) return null;
	const start = folded(text).indexOf(needle);
	return start < 0 ? null : { start, end: start + needle.length };
}

/** The text cut in three around the match. */
export function hitIn(text: string, query: string): TextHit | null {
	const found = findIn(text, query);
	if (!found) return null;
	return { before: text.slice(0, found.start), match: text.slice(found.start, found.end), after: text.slice(found.end) };
}

/** A description as one line of words: no list markers, no breaks, single spaces. */
export function flatDescription(markdown: string): string {
	return markdown
		.split("\n")
		.map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

/** A line of the description around the match: a little before it, cut at a word with «…», the rest after. */
export function snippetIn(markdown: string, query: string): TextHit | null {
	const hit = hitIn(flatDescription(markdown), query);
	if (!hit || hit.before.length <= SNIPPET_LEAD) return hit;
	const tail = hit.before.slice(-SNIPPET_LEAD);
	const space = tail.indexOf(" ");
	const lead = space >= 0 && space < tail.length - 1 ? tail.slice(space + 1) : tail;
	return { ...hit, before: ELLIPSIS + lead };
}

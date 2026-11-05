import type { SearchHit, SectionKey, SnippetParts, TitlePart } from "../../application/contracts";
import { el } from "../dom";
import { renderTaskCard } from "../TaskCard";

/** The groups of the results, in the order the file's sections stand on the screen, Done last. */
const ORDER: readonly SectionKey[] = ["inbox", "backlog", "soon", "now", "done"];

export interface SearchRow {
	readonly hit: SearchHit;
	readonly el: HTMLElement;
}

/** The found words picked out of the text they stand in. */
function fillParts(parent: HTMLElement, parts: readonly TitlePart[]): void {
	parent.textContent = "";
	for (const part of parts) {
		if (part.match) el(parent, "mark", "tc-hit", part.text);
		else parent.appendChild(document.createTextNode(part.text));
	}
}

function fillSnippet(parent: HTMLElement, snippet: SnippetParts): void {
	fillParts(parent, [
		{ text: snippet.before, match: false },
		{ text: snippet.match, match: true },
		{ text: snippet.after, match: false },
	]);
}

/** A found task as its card: the found words picked out of the title; found in the description, the description's line under the title. */
function renderRow(parent: HTMLElement, hit: SearchHit): HTMLElement {
	const card = renderTaskCard(parent, hit.item, { day: null });
	card.classList.add("tc-hit-card");
	const title = card.querySelector<HTMLElement>(":scope > .tc-card-title");
	if (!title) return card;
	if (hit.title.length > 0) fillParts(title, hit.title);
	if (hit.description) {
		card.classList.add("has-snippet");
		const text = el(null, "div", "tc-hit-text");
		card.replaceChild(text, title);
		text.appendChild(title);
		fillSnippet(el(text, "div", "tc-hit-desc"), hit.description);
	}
	return card;
}

/** The results grouped by section, each group under its section's name; no group for a section with nothing found. */
export function renderSearchRows(parent: HTMLElement, hits: readonly SearchHit[], sectionName: (section: SectionKey) => string): SearchRow[] {
	const rows: SearchRow[] = [];
	for (const section of ORDER) {
		const found = hits.filter((hit) => hit.item.list === section);
		if (found.length === 0) continue;
		el(el(parent, "div", "tc-group-head"), "div", "tc-group-name", sectionName(section));
		for (const hit of found) rows.push({ hit, el: renderRow(parent, hit) });
	}
	return rows;
}

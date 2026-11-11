import type { FoundPart, SearchGroup, SearchHit, SectionKey } from "../../../core/application/contracts";
import { el } from "../dom";
import { renderTaskCard } from "../TaskCard";

export interface SearchRow {
	readonly hit: SearchHit;
	readonly el: HTMLElement;
}

/** The found words picked out of the text they stand in. */
function fillParts(parent: HTMLElement, parts: readonly FoundPart[]): void {
	parent.textContent = "";
	for (const part of parts) {
		if (part.match) el(parent, "mark", "tc-hit", part.text);
		else parent.appendChild(document.createTextNode(part.text));
	}
}

/**
 * A found task as its card: the found words picked out of the title; found in its project's name, that name's line under the
 * title, else found in the description, the description's line.
 */
function renderRow(parent: HTMLElement, hit: SearchHit): HTMLElement {
	const card = renderTaskCard(parent, hit.item, { day: null, own: true });
	card.classList.add("tc-hit-card");
	const title = card.querySelector<HTMLElement>(":scope > .tc-card-title");
	if (!title) return card;
	if (hit.title.length > 0) fillParts(title, hit.title);
	const snippet = hit.project ?? hit.description;
	if (snippet) {
		card.classList.add("has-snippet");
		const text = el(null, "div", "tc-hit-text");
		card.replaceChild(text, title);
		text.appendChild(title);
		fillParts(el(text, "div", hit.project ? "tc-hit-desc is-project" : "tc-hit-desc"), snippet);
	}
	return card;
}

/** The search's groups as it gives them, each under its section's name. */
export function renderSearchRows(parent: HTMLElement, groups: readonly SearchGroup[], sectionName: (section: SectionKey) => string): SearchRow[] {
	const rows: SearchRow[] = [];
	for (const group of groups) {
		el(el(parent, "div", "tc-group-head"), "div", "tc-group-name", sectionName(group.list));
		for (const hit of group.hits) rows.push({ hit, el: renderRow(parent, hit) });
	}
	return rows;
}

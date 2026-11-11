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

/** Where a task stands among the projects, top project first: «Дружба › iPhone». */
const PATH_STEP = " › ";

/**
 * A found task as its card: the found words picked out of the title; found in its project's name, that name's line under the
 * title, else found in the description, the description's line. From the Projects screen (`paths`) the task's place among
 * the projects stands small over its title, after the folder mark, as a By stage card's subproject: the same task in two
 * projects is told apart at once; the folder mark goes, the path says the project.
 */
function renderRow(parent: HTMLElement, hit: SearchHit, paths: boolean): HTMLElement {
	const path = paths && hit.projectPath ? hit.projectPath.join(PATH_STEP) : null;
	const card = renderTaskCard(parent, hit.item, { day: null, over: path });
	card.classList.add("tc-hit-card");
	if (path !== null) {
		card.querySelector(":scope > .tc-project-mark")?.remove();
		const title = card.querySelector<HTMLElement>(".tc-card-lines > .tc-card-title");
		if (title && hit.title.length > 0 && !hit.item.card.step) fillParts(title, hit.title);
		return card;
	}
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
export function renderSearchRows(parent: HTMLElement, groups: readonly SearchGroup[], sectionName: (section: SectionKey) => string, paths = false): SearchRow[] {
	const rows: SearchRow[] = [];
	for (const group of groups) {
		el(el(parent, "div", "tc-group-head"), "div", "tc-group-name", sectionName(group.list));
		for (const hit of group.hits) rows.push({ hit, el: renderRow(parent, hit, paths) });
	}
	return rows;
}

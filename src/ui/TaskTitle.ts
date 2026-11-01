import { textParts } from "../application/taskText";
import { el } from "./dom";

/** Where a link in a title goes: a note by the link text Obsidian resolves, or an address. */
export interface TaskLink {
	readonly kind: "note" | "url";
	readonly target: string;
}

/** A title as the card shows it: the text as typed, each link by its word. */
export function fillTitle(node: HTMLElement, text: string): void {
	for (const part of textParts(text)) {
		if (part.kind === "text") {
			node.appendChild(document.createTextNode(part.text));
			continue;
		}
		const link = el(node, "span", "tc-link", part.label);
		link.dataset.kind = part.kind;
		link.dataset.target = part.target;
	}
}

/** The link a tap landed on, if any. */
export function linkAt(target: EventTarget | null): TaskLink | null {
	const link = target instanceof Element ? target.closest<HTMLElement>(".tc-link") : null;
	if (!link?.dataset.target) return null;
	return { kind: link.dataset.kind === "url" ? "url" : "note", target: link.dataset.target };
}

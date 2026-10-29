import type { TaskItem } from "../application/contracts";
import { dayOfMonth, monthAbbreviation } from "./dates";
import { el } from "./dom";

export interface TaskCardOptions {
	readonly showDue: boolean;
}

/** A card of the list: the strip of a task in progress, the title fading out on the right, the due date. */
export function renderTaskCard(parent: HTMLElement | null, item: TaskItem, opts: TaskCardOptions): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillCard(card, item, opts);
	return card;
}

export function fillCard(card: HTMLElement, item: TaskItem, opts: TaskCardOptions): void {
	if (item.status === "inProgress") el(card, "span", "tc-strip");
	el(card, "div", "tc-card-title", item.text);
	if (opts.showDue && item.dueDate) {
		const due = el(card, "span", "tc-due");
		el(due, "span", "tc-due-day", dayOfMonth(item.dueDate));
		el(due, "span", "tc-due-mon", monthAbbreviation(item.dueDate));
	}
}

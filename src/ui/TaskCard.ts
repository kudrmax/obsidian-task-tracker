import type { TaskItem } from "../application/contracts";
import type { LocalDate } from "./types";
import type { PriorityLevel } from "../settings";
import { dayOfMonth, monthAbbreviation } from "./dates";
import { el } from "./dom";

export interface TaskCardOptions {
	/** The day the card is shown on: a due date on that day goes without saying. */
	readonly day: LocalDate | null;
}

/** A card of the list: the strip of a task in progress, the title fading out on the right, the due date. */
export function renderTaskCard(parent: HTMLElement | null, item: TaskItem, opts: TaskCardOptions): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillCard(card, item, opts);
	return card;
}

export function fillCard(card: HTMLElement, item: TaskItem, opts: TaskCardOptions): void {
	markPriority(card, item.priority);
	if (item.status === "inProgress") el(card, "span", "tc-strip");
	el(card, "div", "tc-card-title", item.text);
	if (item.dueDate && item.dueDate !== opts.day) {
		const due = el(card, "span", "tc-due");
		el(due, "span", "tc-due-day", dayOfMonth(item.dueDate));
		el(due, "span", "tc-due-mon", monthAbbreviation(item.dueDate));
	}
}

/** Gives a card, or a dot, the colour of a priority level; none takes it away. */
export function markPriority(node: HTMLElement, level: PriorityLevel | null): void {
	if (level) node.dataset.priority = level.color;
	else delete node.dataset.priority;
}

import type { TaskItem } from "../application/contracts";
import type { LocalDate } from "./types";
import type { PriorityLevel } from "../settings";
import { dayOfMonth, monthAbbreviation } from "./dates";
import { el } from "./dom";

export interface TaskCardOptions {
	/** The day the card is shown on: a due date on that day goes without saying. */
	readonly day: LocalDate | null;
}

/** A card of the list: the strip of a task in progress, the title fading out on the right, the subtask counter, the due date. */
export function renderTaskCard(parent: HTMLElement | null, item: TaskItem, opts: TaskCardOptions): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillCard(card, item, opts);
	return card;
}

/** The strip of a task in progress at `parent`'s left, once; none for a task not in progress. */
export function showStrip(parent: HTMLElement, item: TaskItem): void {
	const strip = parent.querySelector(":scope > .tc-strip");
	if (item.status !== "inProgress") strip?.remove();
	else if (!strip) el(parent, "span", "tc-strip");
}

export function fillCard(card: HTMLElement, item: TaskItem, opts: TaskCardOptions): void {
	markPriority(card, item.priority);
	showStrip(card, item);
	el(card, "div", "tc-card-title", item.text);
	renderProgress(card, item);
	if (item.dueDate && item.dueDate !== opts.day) {
		const due = el(card, "span", "tc-due");
		el(due, "span", "tc-due-day", dayOfMonth(item.dueDate));
		el(due, "span", "tc-due-mon", monthAbbreviation(item.dueDate));
	}
}

/** «2/5»: of the task's own subtasks, the done ones out of those not given up. */
export function renderProgress(card: HTMLElement, item: TaskItem): void {
	if (item.progress) el(card, "span", "tc-count", `${item.progress.done}/${item.progress.total}`);
}

/** Gives a card, or a dot, the colour of a priority level; none takes it away. */
export function markPriority(node: HTMLElement, level: PriorityLevel | null): void {
	if (level) node.dataset.priority = level.color;
	else delete node.dataset.priority;
}

import type { TaskItem } from "../application/contracts";
import type { LocalDate } from "./types";
import type { PriorityLevel } from "../settings";
import { dayOfMonth, monthAbbreviation } from "./dates";
import { el } from "./dom";
import { icon } from "./icons";
import { fillTitle } from "./TaskTitle";

export interface TaskCardOptions {
	/** The day the card is shown on: a due date on that day goes without saying. */
	readonly day: LocalDate | null;
}

/** A card of the list: the strip of a task in progress, the title fading out on the right, the subtask counter over the description mark, the due date. */
export function renderTaskCard(parent: HTMLElement | null, item: TaskItem, opts: TaskCardOptions): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillCard(card, item, opts);
	return card;
}

/** A text typed and not yet written, drawn as a plain card with its title alone until the file has the task. */
export function renderUnwrittenCard(parent: HTMLElement | null, text: string): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillTitle(el(card, "div", "tc-card-title"), text);
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
	fillTitle(el(card, "div", "tc-card-title"), item.text);
	renderMeta(card, item);
	if (item.dueDate && item.dueDate !== opts.day) {
		const due = el(card, "span", "tc-due");
		el(due, "span", "tc-due-day", dayOfMonth(item.dueDate));
		el(due, "span", "tc-due-mon", monthAbbreviation(item.dueDate));
	}
}

/**
 * One column where the subtask counter stood: «2/5», of the task's own subtasks the done ones out of those not given up,
 * and under it the mark of a description; either alone when the task has only that.
 */
export function renderMeta(card: HTMLElement, item: TaskItem): void {
	const meta = metaOf(item);
	if (meta) card.appendChild(meta);
}

/** The column of a card already drawn, right after its title, as the task now stands: set, changed, or taken away. */
export function showMeta(card: HTMLElement, item: TaskItem): void {
	card.querySelector(":scope > .tc-meta")?.remove();
	const meta = metaOf(item);
	if (meta) card.querySelector(":scope > .tc-card-title")?.after(meta);
}

function metaOf(item: TaskItem): HTMLElement | null {
	if (!item.progress && item.description === null) return null;
	const meta = el(null, "span", "tc-meta");
	if (item.progress) el(meta, "span", "tc-count", `${item.progress.done}/${item.progress.total}`);
	if (item.description !== null) meta.appendChild(icon("description")).classList.add("tc-desc-mark");
	meta.classList.toggle("is-pair", item.progress !== null && item.description !== null);
	return meta;
}

/** Gives a card, or a dot, the colour of a priority level; none takes it away. */
export function markPriority(node: HTMLElement, level: PriorityLevel | null): void {
	if (level) node.dataset.priority = level.color;
	else delete node.dataset.priority;
}

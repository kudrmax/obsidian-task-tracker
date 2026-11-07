import { cardDue, type PriorityLevel, type TaskItem } from "../../core/application/contracts";
import { LABEL_SLOTS } from "./priorityColors";
import type { LocalDate } from "./types";
import { dayOfMonth, monthAbbreviation } from "./dates";
import { el } from "./dom";
import { icon } from "./kit/icons";
import { fillTitle } from "./TaskTitle";

export interface TaskCardOptions {
	/** The day the card is shown on: a due date on that day goes without saying. */
	readonly day: LocalDate | null;
}

/** A card of the list: the dot of a task in progress, the title fading out on the right, the subtask counter over the description mark, the due date; a card peeking out under it while its subtasks are folded away. */
export function renderTaskCard(parent: HTMLElement | null, item: TaskItem, opts: TaskCardOptions): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillCard(card, item, opts);
	return card;
}

/** A text typed and not yet written, drawn as a plain card with its title alone until the file has the task. */
export function renderUnwrittenCard(parent: HTMLElement | null, text: string): HTMLElement {
	const card = el(parent, "div", "tc-card");
	fillUnwrittenCard(card, text);
	return card;
}

/** A card filled as a text typed and not yet written: its title alone. */
export function fillUnwrittenCard(card: HTMLElement, text: string): void {
	markColours(card, { colors: [] });
	card.classList.remove("is-collapsed");
	fillTitle(el(card, "div", "tc-card-title"), text);
}

/** The dot of a task in progress in `parent`'s left padding, once; none for a task not in progress. */
export function showProgressDot(parent: HTMLElement, item: TaskItem): void {
	const dot = parent.querySelector(":scope > .tc-progress-dot");
	if (item.status !== "inProgress") dot?.remove();
	else if (!dot) el(parent, "span", "tc-progress-dot");
}

export function fillCard(card: HTMLElement, item: TaskItem, opts: TaskCardOptions): void {
	markColours(card, item);
	card.classList.toggle("is-collapsed", item.collapsed);
	showProgressDot(card, item);
	fillTitle(el(card, "div", "tc-card-title"), item.text);
	renderProjectMark(card, item);
	renderMeta(card, item);
	const corner = cardDue(item, opts.day);
	if (!corner) return;
	const { date, repeats } = corner;
	const due = el(card, "span", "tc-due");
	due.classList.toggle("is-repeat-only", date === null);
	const top = repeats ? el(due, "span", "tc-due-top") : due;
	if (date) el(top, "span", "tc-due-day", dayOfMonth(date));
	if (repeats) top.appendChild(icon("repeat")).classList.add("tc-due-repeat");
	if (date) el(due, "span", "tc-due-mon", monthAbbreviation(date));
}

/**
 * One column where the subtask counter stood: «2/5», of the task's own subtasks the done ones out of those not given up,
 * and under it the mark of a description; either alone when the task has only that.
 */
export function renderMeta(card: HTMLElement, item: TaskItem): void {
	const meta = metaOf(item);
	if (meta) card.appendChild(meta);
}

/** The column of a card already drawn, right after its title and its project's mark, as the task now stands: set, changed, or taken away. */
export function showMeta(card: HTMLElement, item: TaskItem): void {
	card.querySelector(":scope > .tc-meta")?.remove();
	const meta = metaOf(item);
	if (meta) (card.querySelector(":scope > .tc-project-mark") ?? card.querySelector(":scope > .tc-card-title"))?.after(meta);
}

/**
 * The folder of a task's project on the right of its card, in the date's place and of its width, left of the counter,
 * the date and the repeat; on the Mac its tooltip names the project. None where the screen shows no mark (`ProjectRef.mark`).
 */
export function renderProjectMark(card: HTMLElement, item: Pick<TaskItem, "project">): void {
	const project = item.project;
	if (!project?.mark) return;
	const mark = el(card, "span", "tc-project-mark");
	mark.appendChild(icon("project"));
	mark.setAttribute("aria-label", project.name);
	mark.title = project.name;
	mark.classList.toggle("is-openable", project.canOpenNote);
}

/** A tap on a card's project mark opens the project's note, in place of its menu. */
export function onProjectMark(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest(".tc-project-mark") !== null;
}

/** A tap on the subtask counter of a card folds the task's subtasks away or shows them again, in place of its menu. */
export function onCounter(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest(".tc-count") !== null;
}

function metaOf(item: TaskItem): HTMLElement | null {
	if (!item.progress && item.description === null) return null;
	const meta = el(null, "span", "tc-meta");
	if (item.progress) el(meta, "span", "tc-count", `${item.progress.done}/${item.progress.total}`);
	if (item.description !== null) meta.appendChild(icon("description")).classList.add("tc-desc-mark");
	meta.classList.toggle("is-pair", item.progress !== null && item.description !== null);
	return meta;
}

/**
 * Gives a card the colours of its task, as the service lists them. The first colour tints it as a priority does; a card
 * of several colours also carries each, up to four, which the stylesheet paints as stripes or a blend.
 */
export function markColours(card: HTMLElement, item: Pick<TaskItem, "colors">): void {
	const colours = item.colors.slice(0, LABEL_SLOTS.length);
	if (colours.length > 0) card.dataset.priority = colours[0];
	else delete card.dataset.priority;
	LABEL_SLOTS.forEach((slot, i) => {
		if (colours.length > 1 && i < colours.length) card.setAttribute(slot.attribute, colours[i]);
		else card.removeAttribute(slot.attribute);
	});
	if (colours.length > 1) card.dataset.labels = String(colours.length);
	else delete card.dataset.labels;
}

/** Gives a card, or a dot, the colour of a priority level; none takes it away. */
export function markPriority(node: HTMLElement, level: PriorityLevel | null): void {
	if (level) node.dataset.priority = level.color;
	else delete node.dataset.priority;
}

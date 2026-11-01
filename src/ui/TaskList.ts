import type { GroupName, TaskItem } from "../application/contracts";
import { PROPERTY } from "./design";
import type { LocalDate } from "./types";
import { clear, el } from "./dom";
import { type ListGroup, listGroups, showsHeaders } from "./listGroups";
import type { GapPlace } from "./drag/listPlace";
import type { PendingText } from "./quick/QuickEntry";
import { renderTaskCard } from "./TaskCard";

/** A task being typed in the list: the texts already typed, as plain cards each at its level, and the field after them, in `place`. */
export interface ListEntryInput {
	readonly place: GapPlace;
	readonly pending: readonly PendingText[];
	/** Draws the field into `parent`, the row that stands in the list; gives the field's element. */
	field(parent: HTMLElement): HTMLElement;
}

export interface TaskListDeps {
	items(): readonly TaskItem[];
	/** The day the list shows, whose date its cards leave out; null for a list of no day. */
	day(): LocalDate | null;
	/** Whether the list shows its sections: Inbox, Soon, and the day column on today. */
	grouped?(): boolean;
	/** The header over the tasks outside any section. */
	ungroupedName?(): string;
	/** A card waiting for the name of the section it starts: drawn last, under the place for the name. */
	pending?(): TaskItem | null;
	/** The task being typed, which takes its place among the cards without being one of them; null when none is. */
	entry?(): ListEntryInput | null;
	/** `subtree` gives the cards of the task's subtasks at every depth: they go wherever the task goes. */
	onCard?(card: HTMLElement, item: TaskItem, subtree: readonly HTMLElement[]): void;
	onHeader?(head: HTMLElement, group: ListGroup): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
	/** 0 for a task, one more for each task above a subtask. */
	readonly level: number;
}

/**
 * A column of cards that scrolls: each task with its open subtasks right under it, a level further in, a branch running
 * from the task to each; with sections, a header over each.
 */
export class TaskList {
	private entries: ListEntry[] = [];
	private rendered: ListGroup[] = [];
	private nodes: HTMLElement[] = [];
	private withHeaders = false;
	private slot: HTMLElement | null = null;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TaskListDeps,
	) {
		el.classList.add("tc-list");
	}

	render(): void {
		clear(this.el);
		this.entries = [];
		this.nodes = [];
		const day = this.deps.day();
		const items = this.deps.items();
		this.rendered = this.deps.grouped?.() ? [...listGroups(items)] : [{ name: null, items }];
		this.withHeaders = showsHeaders(this.rendered);
		const entry = this.deps.entry?.() ?? null;
		const rows: { node: HTMLElement; level: number }[] = [];
		let entered = entry === null;
		const enter = (group: GroupName): void => {
			if (entered || !entry || entry.place.index !== this.entries.length || (this.withHeaders && entry.place.group !== group)) return;
			entered = true;
			this.enterRows(entry, rows);
		};
		const add = (item: TaskItem, level: number, group: GroupName): void => {
			enter(group);
			const card = renderTaskCard(this.el, item, { day });
			card.style.setProperty(PROPERTY.level, String(level));
			this.entries.push({ card, item, level });
			this.nodes.push(card);
			rows.push({ node: card, level });
			const from = this.entries.length;
			item.subtasks.forEach((sub) => add(sub, level + 1, group));
			this.deps.onCard?.(card, item, this.entries.slice(from).map((e) => e.card));
		};
		const aboveHeaders = this.withHeaders && entry?.place.group === null && !this.rendered.some((g) => g.name === null);
		if (aboveHeaders) enter(null);
		for (const group of this.rendered) {
			if (this.withHeaders) this.nodes.push(this.header(group));
			for (const item of group.items) add(item, 0, group.name);
			enter(group.name);
		}
		if (!entered && entry) this.enterRows(entry, rows);
		rows.forEach((row, i) => {
			if (row.level === 0) return;
			const { through, last } = linesOf(rows.map((r) => r.level), i);
			branch(row.node, through, last);
		});
		const pending = this.deps.pending?.() ?? null;
		this.slot = pending ? el(this.el, "div", "tc-group-slot") : null;
		if (pending) renderTaskCard(this.el, pending, { day });
	}

	private enterRows(entry: ListEntryInput, rows: { node: HTMLElement; level: number }[]): void {
		const put = (row: HTMLElement, level: number): void => {
			row.style.setProperty(PROPERTY.level, String(level));
			rows.push({ node: row, level });
		};
		for (const { text, level } of entry.pending) {
			const card = el(this.el, "div", "tc-card");
			el(card, "div", "tc-card-title", text);
			put(card, level);
		}
		const row = el(this.el, "div", "tc-quick-row");
		entry.field(row);
		put(row, entry.place.level);
	}

	/** Where the name of the section a pending card starts is typed; null without one. */
	get pendingSlot(): HTMLElement | null {
		return this.slot;
	}

	get cards(): readonly ListEntry[] {
		return this.entries;
	}

	/** The sections as drawn; one ungrouped run when the list shows none. */
	get groups(): readonly ListGroup[] {
		return this.rendered;
	}

	get headers(): boolean {
		return this.withHeaders;
	}

	/** Headers and cards in the order they stand. */
	get elements(): readonly HTMLElement[] {
		return this.nodes;
	}

	private header(group: ListGroup): HTMLElement {
		const head = el(this.el, "div", group.name === null ? "tc-group-head is-ungrouped" : "tc-group-head");
		el(head, "span", "tc-group-name", group.name ?? this.deps.ungroupedName?.() ?? "");
		this.deps.onHeader?.(head, group);
		return head;
	}
}

/**
 * The branch lines of the row at `i` among rows of these `levels`: whether it is the last of its task's subtasks, and for each
 * task above its own whether that one has a later sibling, so its line goes on past the row.
 */
function linesOf(levels: readonly number[], i: number): { through: boolean[]; last: boolean } {
	const goesOn = (level: number): boolean => levels.slice(i + 1).find((l) => l <= level) === level;
	const through = Array.from({ length: levels[i] - 1 }, (_, k) => goesOn(k + 1));
	return { through, last: !goesOn(levels[i]) };
}

/** A subtask's branch from its task, bending in if it is the last; and the lines of the tasks further up that go on past it. */
function branch(card: HTMLElement, through: readonly boolean[], last: boolean): void {
	el(card, "span", last ? "tc-branch is-last" : "tc-branch");
	through.forEach((goesOn, i) => {
		if (goesOn) el(card, "span", "tc-branch-pass").style.setProperty(PROPERTY.pass, String(through.length - i));
	});
}

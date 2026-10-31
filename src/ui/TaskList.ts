import type { TaskItem } from "../application/contracts";
import { PROPERTY } from "./design";
import type { LocalDate } from "./types";
import { clear, el } from "./dom";
import { type ListGroup, listGroups, showsHeaders } from "./listGroups";
import { renderTaskCard } from "./TaskCard";

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
		/** `through`: for each task above the subtask's own, whether its line goes on past the card to a later subtask. */
		const add = (item: TaskItem, level: number, through: readonly boolean[], last: boolean): void => {
			const card = renderTaskCard(this.el, item, { day });
			card.style.setProperty(PROPERTY.level, String(level));
			if (level > 0) branch(card, through, last);
			this.entries.push({ card, item, level });
			this.nodes.push(card);
			const from = this.entries.length;
			const below = level > 0 ? [...through, !last] : [];
			item.subtasks.forEach((sub, i) => add(sub, level + 1, below, i === item.subtasks.length - 1));
			this.deps.onCard?.(card, item, this.entries.slice(from).map((e) => e.card));
		};
		for (const group of this.rendered) {
			if (this.withHeaders) this.nodes.push(this.header(group));
			for (const item of group.items) add(item, 0, [], false);
		}
		const pending = this.deps.pending?.() ?? null;
		this.slot = pending ? el(this.el, "div", "tc-group-slot") : null;
		if (pending) renderTaskCard(this.el, pending, { day });
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

/** A subtask's branch from its task, bending in if it is the last; and the lines of the tasks further up that go on past it. */
function branch(card: HTMLElement, through: readonly boolean[], last: boolean): void {
	el(card, "span", last ? "tc-branch is-last" : "tc-branch");
	through.forEach((goesOn, i) => {
		if (goesOn) el(card, "span", "tc-branch-pass").style.setProperty(PROPERTY.pass, String(through.length - i));
	});
}

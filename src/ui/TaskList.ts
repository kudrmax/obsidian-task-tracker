import type { TaskItem } from "../application/contracts";
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
	onCard?(card: HTMLElement, item: TaskItem): void;
	onHeader?(head: HTMLElement, group: ListGroup): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
}

/** A column of cards that scrolls; with sections, a header over each. */
export class TaskList {
	private entries: ListEntry[] = [];
	private rendered: ListGroup[] = [];
	private nodes: HTMLElement[] = [];
	private withHeaders = false;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TaskListDeps,
	) {
		el.classList.add("tc-list");
	}

	render(): void {
		clear(this.el);
		const day = this.deps.day();
		const items = this.deps.items();
		this.rendered = this.deps.grouped?.() ? [...listGroups(items)] : [{ name: null, items }];
		this.withHeaders = showsHeaders(this.rendered);
		this.entries = [];
		this.nodes = [];
		for (const group of this.rendered) {
			if (this.withHeaders) this.nodes.push(this.header(group));
			for (const item of group.items) {
				const card = renderTaskCard(this.el, item, { day });
				this.deps.onCard?.(card, item);
				this.entries.push({ card, item });
				this.nodes.push(card);
			}
		}
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

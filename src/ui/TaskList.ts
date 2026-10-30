import type { TaskItem } from "../application/contracts";
import type { LocalDate } from "./types";
import { clear } from "./dom";
import { renderTaskCard } from "./TaskCard";

export interface TaskListDeps {
	items(): readonly TaskItem[];
	/** The day the list shows, whose date its cards leave out; null for a list of no day. */
	day(): LocalDate | null;
	onCard?(card: HTMLElement, item: TaskItem): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
}

/** A column of cards that scrolls. */
export class TaskList {
	private entries: ListEntry[] = [];

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TaskListDeps,
	) {
		el.classList.add("tc-list");
	}

	render(): void {
		clear(this.el);
		const day = this.deps.day();
		this.entries = this.deps.items().map((item) => {
			const card = renderTaskCard(this.el, item, { day });
			this.deps.onCard?.(card, item);
			return { card, item };
		});
	}

	get cards(): readonly ListEntry[] {
		return this.entries;
	}
}

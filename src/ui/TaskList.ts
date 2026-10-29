import type { TaskItem } from "../application/contracts";
import { clear } from "./dom";
import { renderTaskCard } from "./TaskCard";

export interface TaskListDeps {
	items(): readonly TaskItem[];
	showDue(): boolean;
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
		const showDue = this.deps.showDue();
		this.entries = this.deps.items().map((item) => {
			const card = renderTaskCard(this.el, item, { showDue });
			this.deps.onCard?.(card, item);
			return { card, item };
		});
	}

	get cards(): readonly ListEntry[] {
		return this.entries;
	}
}

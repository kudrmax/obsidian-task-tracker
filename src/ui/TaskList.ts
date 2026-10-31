import type { TaskItem } from "../application/contracts";
import { PROPERTY } from "./design";
import type { LocalDate } from "./types";
import { clear } from "./dom";
import { renderTaskCard } from "./TaskCard";

export interface TaskListDeps {
	items(): readonly TaskItem[];
	/** The day the list shows, whose date its cards leave out; null for a list of no day. */
	day(): LocalDate | null;
	/** `subtree` gives the cards of the task's subtasks at every depth: they go wherever the task goes. */
	onCard?(card: HTMLElement, item: TaskItem, subtree: readonly HTMLElement[]): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
	/** 0 for a task, one more for each task above a subtask. */
	readonly level: number;
}

/** A column of cards that scrolls: each task with its open subtasks right under it, a level further in. */
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
		this.entries = [];
		const day = this.deps.day();
		const add = (item: TaskItem, level: number): void => {
			const card = renderTaskCard(this.el, item, { day });
			card.style.setProperty(PROPERTY.level, String(level));
			this.entries.push({ card, item, level });
			const from = this.entries.length;
			for (const sub of item.subtasks) add(sub, level + 1);
			this.deps.onCard?.(card, item, this.entries.slice(from).map((e) => e.card));
		};
		for (const item of this.deps.items()) add(item, 0);
	}

	get cards(): readonly ListEntry[] {
		return this.entries;
	}
}

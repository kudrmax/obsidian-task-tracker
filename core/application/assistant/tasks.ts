import type { LocalDate, SectionKey } from "../../domain/Task";
import type { MenuFrom, MenuScreen, TaskCard, TaskItem, TaskKey, TaskMenuModel } from "../contracts";
import type { SectionOffer } from "../sections";

/** Every task of each list as the screen draws it, each with its subtasks, and today: what the assistant reads. */
export interface ListedTasks {
	readonly today: LocalDate;
	readonly lists: Readonly<Record<SectionKey, readonly TaskItem[]>>;
}

/**
 * Where the assistant reads the tasks from, and how it touches them: the task service, over the file it keeps. It writes only
 * through the calls a tap in a task's menu makes (`menu` to see the tile, `toggleLabel` to press it), never its own write.
 */
export interface AssistantTasks {
	listed(): Promise<ListedTasks>;
	sectionOffer(date: LocalDate): Promise<SectionOffer>;
	menu(item: TaskItem, from: MenuFrom, screen: MenuScreen): TaskMenuModel;
	toggleLabel(keys: readonly TaskKey[], name: string): Promise<readonly (TaskItem | null)[]>;
}

/** The tasks as they are now, by id, closed ones and subtasks at every depth too. */
export class TaskLookup {
	private readonly byId = new Map<string, TaskItem>();
	private readonly parents = new Map<string, TaskItem>();

	constructor(listed: ListedTasks) {
		const add = (item: TaskItem): void => {
			this.byId.set(item.id, item);
			for (const sub of item.allSubtasks) {
				this.parents.set(sub.id, item);
				add(sub);
			}
		};
		for (const items of Object.values(listed.lists)) items.forEach(add);
	}

	/** Every task, closed ones and subtasks at every depth too. */
	all(): readonly TaskItem[] {
		return [...this.byId.values()];
	}

	find(id: string): TaskItem | null {
		return this.byId.get(id) ?? null;
	}

	/** The tasks above this one, the top one first; empty for a task. */
	above(id: string): readonly TaskItem[] {
		const chain: TaskItem[] = [];
		for (let parent = this.parents.get(id); parent; parent = this.parents.get(parent.id)) chain.unshift(parent);
		return chain;
	}
}

/** How the popup draws a chosen task: the card and the task whose marks it carries. */
export interface DrawnAnswer {
	readonly task: TaskItem;
	readonly card: TaskCard;
}

/**
 * The chosen task as the screen draws it: a folded task's next step on that folded task's card (the topmost folded task
 * above it, the one it was chosen from); any other subtask on its own card, its task's title small above; a task alone.
 */
export function drawnAnswer(chosen: TaskItem, tasks: TaskLookup): DrawnAnswer {
	const above = tasks.above(chosen.id);
	const folded = above.find((item) => item.collapsed);
	if (folded && folded.card.step?.id === chosen.id) return { task: folded, card: folded.card };
	const over = above.length > 0 ? above[above.length - 1].title : null;
	return { task: chosen, card: { text: chosen.text, title: chosen.title, over, step: null } };
}

import type { LocalDate, SectionKey } from "../../domain/Task";
import type { TaskItem } from "../contracts";

/** Every task of each list as the screen draws it, each with its subtasks, and today: what the assistant reads. */
export interface ListedTasks {
	readonly today: LocalDate;
	readonly lists: Readonly<Record<SectionKey, readonly TaskItem[]>>;
}

/** Where the assistant reads the tasks from: the task service, over the file it keeps. */
export interface AssistantTasks {
	listed(): Promise<ListedTasks>;
}

/** The tasks as they are now, by id, closed ones and subtasks at every depth too. */
export class TaskLookup {
	private readonly byId = new Map<string, TaskItem>();

	constructor(listed: ListedTasks) {
		const add = (item: TaskItem): void => {
			this.byId.set(item.id, item);
			item.allSubtasks.forEach(add);
		};
		for (const items of Object.values(listed.lists)) items.forEach(add);
	}

	find(id: string): TaskItem | null {
		return this.byId.get(id) ?? null;
	}
}

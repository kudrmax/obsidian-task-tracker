import type { TaskItem, TaskKey } from "../../application/contracts";

/**
 * The task an open menu acts on: the one holder every action of the menu reads it from. A change that rewrites the
 * task's line (Remove repeat, the rule written as the menu closes) gives the key it left, and the next change waits for
 * it and uses that, so the menu keeps finding its task; an action that writes nothing reads the task as it stands now.
 */
export class MenuTask {
	private pending: Promise<void> = Promise.resolve();

	constructor(private current: TaskItem) {}

	get item(): TaskItem {
		return this.current;
	}

	run(change: (item: TaskItem) => Promise<TaskKey | void>): Promise<void> {
		const next = this.pending.then(async () => {
			const moved = await change(this.current);
			if (moved) this.current = { ...this.current, key: moved };
		});
		this.pending = next.catch(() => undefined);
		return next;
	}
}

import type { TaskKey } from "../../application/contracts";

/**
 * The key of the task an open menu acts on. A change that rewrites the task's line (the repeat page applies every tap at once)
 * gives the key it left, and the next change waits for it and uses that, so the menu keeps finding its task.
 */
export class MenuTaskKey {
	private pending: Promise<void> = Promise.resolve();

	constructor(private key: TaskKey) {}

	run(change: (key: TaskKey) => Promise<TaskKey | void>): Promise<void> {
		const next = this.pending.then(async () => {
			const moved = await change(this.key);
			if (moved) this.key = moved;
		});
		this.pending = next.catch(() => undefined);
		return next;
	}
}

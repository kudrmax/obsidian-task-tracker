/** A task's menu over the block (`tasks.menu`): pinned to the task by its id (P6). Built out by the menu layer. */
export interface TaskMenuLayer {
	readonly kind: "taskMenu";
	readonly closing: boolean;
	/** The card's row key (the task's id) the menu opened from. */
	readonly id: string;
}

/** The task menu's messages (its pages, its picks). */
export type MenuMsg = { readonly kind: "opened"; readonly id: string };

/** The full card of a task over the block: pinned to the task by its id (P6). Built out by the full card's layer. */
export interface FullLayer {
	readonly kind: "full";
	readonly closing: boolean;
	readonly id: string;
}

/** The full card's messages. `open`: from a menu (full screen, Add description, which puts the caret in the description) or a find. */
export type FullMsg = { readonly kind: "open"; readonly id: string; readonly description: boolean };

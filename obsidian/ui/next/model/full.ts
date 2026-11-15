/** The full card of a task over the block: pinned to the task by its id (P6). Built out by the full card's layer. */
export interface FullLayer {
	readonly kind: "full";
	readonly closing: boolean;
	readonly id: string;
}

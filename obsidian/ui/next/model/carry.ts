/** A card carried inside the block: built out by the carry. */
export interface CarryModel {
	readonly id: string;
}

/** The carry's messages (the pointer's gestures as the recognizers read them). */
export type CarryMsg = { readonly kind: "none" };

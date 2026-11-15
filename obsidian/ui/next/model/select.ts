/**
 * Picked cards in the block (bulk actions): Select tasks (⋯) puts a circle on every list card and a tap picks; on the
 * desktop ⌘-click picks without it and Shift-click picks a run. Cards are held by their row keys (the tasks' ids, P6).
 */
export interface SelectModel {
	/** Select tasks is on: the circles show, a tap picks, the capsule and the actions button stand in the foot. */
	readonly selecting: boolean;
	/** The picked cards' row keys, in the order picked. */
	readonly picked: readonly string[];
}

/** Select mode's messages. */
export type SelectMsg =
	/** ⋯ → Select tasks. */
	| { readonly kind: "start" }
	/** The capsule's cross, Escape: the picks go and Select tasks ends. */
	| { readonly kind: "stop" }
	/** A card tapped while picking (Select tasks, or ⌘ on the desktop): picked or let go; `run` (Shift) picks the run from the last pick. */
	| { readonly kind: "toggle"; readonly key: string; readonly run: boolean }
	/** The count or the actions button: the picked cards' menu. */
	| { readonly kind: "actions" }
	/** A press on an empty place: picks made without Select tasks go. */
	| { readonly kind: "pressedAway" };

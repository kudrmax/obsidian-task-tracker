import type { TaskItem, TaskKey } from "../../application/contracts";
import type { Slot } from "../types";

export type DragOrigin = "left" | "soon" | "timeline";

export interface DragPayload {
	readonly item: TaskItem;
	readonly from: DragOrigin;
	/** How long a slot the task takes on the timeline: its own, or the default for a task without one. */
	readonly durationMin: number;
	/** How far into the slot the finger holds it: a block keeps its grip, a card hangs by its middle. */
	readonly anchorMin: number;
}

export type DropResult =
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "listBefore"; readonly before: TaskKey | null; readonly column: "left" | "soon" }
	| { readonly kind: "clearSlot" };

/** Somewhere a dragged task may land: it previews while the pointer is over it and says what the drop means. */
export interface DropTarget {
	hitTest(x: number, y: number, drag: DragPayload): boolean;
	preview(x: number, y: number, drag: DragPayload): void;
	/** Where the card will come to rest, in client pixels, while a preview shows. */
	landing(): DOMRect | null;
	clear(): void;
	drop(x: number, y: number, drag: DragPayload): DropResult | null;
}

/** The card under the finger. */
export interface Float {
	moveTo(x: number, y: number): void;
	flyTo(rect: DOMRect): Promise<void>;
	remove(): void;
}

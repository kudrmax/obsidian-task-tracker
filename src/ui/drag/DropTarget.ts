import type { TaskItem, TaskKey } from "../../application/contracts";
import type { Slot } from "../types";

/** The lists a card is dragged from or dropped on: the day list beside the calendar, Soon and Inbox. */
export type ListColumn = "left" | "soon" | "inbox";

export type DragOrigin = ListColumn | "timeline";

export interface DragPayload {
	readonly item: TaskItem;
	readonly from: DragOrigin;
	/** The duration a task on the timeline keeps when it moves; null for a task without one, and for every task from a list. */
	readonly durationMin: number | null;
	/** How far under the card's top the finger holds it: a timeline card keeps its grip, a list card hangs by its middle. */
	readonly grabPx: number;
}

export type DropResult =
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "listBefore"; readonly before: TaskKey | null; readonly column: ListColumn }
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

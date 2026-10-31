import type { GroupedList, GroupName, TaskItem, TaskKey } from "../../application/contracts";
import type { LocalDate, Slot } from "../types";

/** The lists a card is dragged from or dropped on: the day list beside the calendar, Soon and Inbox. */
export type ListColumn = "left" | "soon" | "inbox";

export type DragOrigin = ListColumn | "timeline";

/** Whose sections a column shows: Inbox's, Soon's, Now's for today, Soon's for a later day with that day as `date`. */
export interface ColumnSections {
	readonly list: GroupedList;
	/** The later day the column shows; null for one of no day or for today. */
	readonly date: LocalDate | null;
}

export interface DragPayload {
	readonly item: TaskItem;
	readonly from: DragOrigin;
	/** The duration a task on the timeline keeps when it moves; null for a task without one, and for every task from a list. */
	readonly durationMin: number | null;
	/** How far under the card's top the finger holds it: a timeline card keeps its grip, a list card hangs by its middle. */
	readonly grabPx: number;
	/** How far right of the card's left edge the finger holds it: in its own list, the card's left edge picks the level it lands on. */
	readonly grabX: number;
}

export type DropResult =
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "listBefore"; readonly before: TaskKey | null; readonly column: ListColumn }
	/** A gap of a list that shows sections: right before `before`, or at the end of `group`. */
	| { readonly kind: "group"; readonly list: GroupedList; readonly date: LocalDate | null; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null }
	| { readonly kind: "clearSlot" }
	| { readonly kind: "postpone"; readonly date: LocalDate }
	/** A zone that starts a section of that name in the list, or the one it has. */
	| { readonly kind: "newGroup"; readonly list: GroupedList; readonly date: LocalDate | null; readonly name: string }
	/** New section: the card goes back, and the list asks for the name. */
	| { readonly kind: "nameGroup"; readonly column: ListColumn; readonly list: GroupedList; readonly date: LocalDate | null }
	| { readonly kind: "pickDate" };

/** A drop that changes the file at once; Pick a date asks for the day first. */
export type PlacedResult = Exclude<DropResult, { readonly kind: "pickDate" } | { readonly kind: "nameGroup" }>;

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

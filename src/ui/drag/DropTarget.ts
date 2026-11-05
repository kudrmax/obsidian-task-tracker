import type { GroupedList, GroupName, TaskItem, TaskKey } from "../../application/contracts";
import type { LocalDate, Slot } from "../types";

/** The lists a card is dragged from or dropped on: the day list beside the calendar, Soon, and Inbox over Backlog. */
export type ListColumn = "left" | "soon" | "inbox" | "backlog";

/** Where a task that exists is dragged from. */
export type TaskOrigin = ListColumn | "timeline";

/** Where a drag begins: a task's place, or "new" for the plus that carries a task not yet written. */
export type DragOrigin = TaskOrigin | "new";

/** Whose sections a column shows: Inbox's, Backlog's, Soon's, Now's for today, Soon's for a later day with that day as `date`. */
export interface ColumnSections {
	readonly list: GroupedList;
	/** The later day the column shows; null for one of no day or for today. */
	readonly date: LocalDate | null;
}

export interface TaskDragPayload {
	readonly item: TaskItem;
	readonly from: TaskOrigin;
	/** The duration a task on the timeline keeps when it moves; null for a task without one, and for every task from a list. */
	readonly durationMin: number | null;
	/** How far under the card's top the finger holds it: a timeline card keeps its grip, a list card hangs by its middle. */
	readonly grabPx: number;
	/** The other picked tasks that go along (bulk actions spec); none for a task carried alone. */
	readonly carried?: readonly CarriedTask[];
}

/** A picked task carried along with the one under the finger, and the list it comes from. */
export interface CarriedTask {
	readonly item: TaskItem;
	readonly from: ListColumn;
}

/** Several tasks carried at once: they go only to the lists, never to the timeline. */
export function carriesMany(drag: DragPayload): boolean {
	return drag.from !== "new" && (drag.carried?.length ?? 0) > 0;
}

/** The drag of a task that does not exist yet: it has no card in any list and no duration. */
export interface NewTaskPayload {
	readonly from: "new";
	readonly item: null;
	readonly durationMin: null;
	readonly grabPx: number;
}

export type DragPayload = TaskDragPayload | NewTaskPayload;

export type DropResult =
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "listBefore"; readonly before: TaskKey | null; readonly column: ListColumn }
	/** A gap of a list that shows sections: right before `before`, or at the end of `group`. */
	| { readonly kind: "group"; readonly list: GroupedList; readonly date: LocalDate | null; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null }
	| { readonly kind: "clearSlot" };

/** Somewhere a dragged task may land: it previews while the pointer is over it and says what the drop means. */
export interface DropTarget {
	hitTest(x: number, y: number, drag: DragPayload): boolean;
	preview(x: number, y: number, drag: DragPayload): void;
	/** Where the card will come to rest, in client pixels, while a preview shows. */
	landing(): DOMRect | null;
	/** The finger has gone elsewhere, the drag goes on. */
	leave(): void;
	/** The drag is over. */
	clear(): void;
	drop(x: number, y: number, drag: DragPayload): DropResult | null;
}

/** The card under the finger. */
export interface Float {
	moveTo(x: number, y: number): void;
	/** Settles where the drop puts it. */
	land(rect: DOMRect): Promise<void>;
	/** Flies back to where it came from. */
	flyTo(rect: DOMRect): Promise<void>;
	remove(): void;
}

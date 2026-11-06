import type { DropColumn, DroppedTask, DropFrom, DropOrigin, DropTo, GroupedList, TaskItem } from "../../application/contracts";
import type { LocalDate } from "../types";

/** The lists a card is dragged from or dropped on: the day list beside the calendar, Soon, and Inbox over Backlog. */
export type ListColumn = DropColumn;

/** Where a task that exists is dragged from. */
export type TaskOrigin = DropFrom;

/** Where a drag begins: a task's place, or "new" for the plus that carries a task not yet written. */
export type DragOrigin = DropOrigin;

/** Whose sections a column shows: Inbox's, Backlog's, Soon's, Now's for today, Soon's for a later day with that day as `date`. */
export interface ColumnSections {
	readonly list: GroupedList;
	/** The later day the column shows; null for one of no day or for today. */
	readonly date: LocalDate | null;
}

export interface TaskDragPayload {
	readonly item: TaskItem;
	readonly from: TaskOrigin;
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

/** Several tasks carried at once. */
export function carriesMany(drag: DragPayload): boolean {
	return drag.from !== "new" && (drag.carried?.length ?? 0) > 0;
}

/** Where the carried tasks come from, the one under the finger first: what a target is asked whether it takes. */
export function originsOf(drag: DragPayload): readonly DragOrigin[] {
	return drag.from === "new" ? ["new"] : [drag.from, ...(drag.carried ?? []).map((carried) => carried.from)];
}

/** The tasks a drag lets go, the one under the finger first. */
export function droppedTasks(drag: TaskDragPayload): readonly DroppedTask[] {
	return [{ key: drag.item.key, from: drag.from }, ...(drag.carried ?? []).map((carried) => ({ key: carried.item.key, from: carried.from }))];
}

/** The drag of a task that does not exist yet: it has no card in any list and no duration. */
export interface NewTaskPayload {
	readonly from: "new";
	readonly item: null;
	readonly grabPx: number;
}

export type DragPayload = TaskDragPayload | NewTaskPayload;

/** Where the task lands, as the target found it: what it means is the service's (`TaskService.drop`). */
export type DropResult = DropTo;

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

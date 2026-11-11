import type { DropColumn, DroppedTask, ListPlace, DropFrom, DropOrigin, DropTo, GroupedList, ProjectsLanding, ProjectsNodeId, TaskItem } from "../../../core/application/contracts";
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

/**
 * Where something is let go on the Projects screen: a card on a row of the tree (`TaskService.dropOnProject`), the plus
 * at a gap of the tree (a new project there), and a card or the plus between the tasks' cards.
 */
export type ProjectsDrop =
	| { readonly kind: "projectRow"; readonly node: ProjectsNodeId }
	| { readonly kind: "projectGap"; readonly gap: number; readonly landing: ProjectsLanding }
	/**
	 * Cards let go between the tasks' cards, at the place the lists' own drop machinery found (`TaskService.dropInProjects`);
	 * the plus there, the field of a new task at that place (`QuickEntrySession.openAt`).
	 */
	| { readonly kind: "projectsPlace"; readonly place: ListPlace };

/** Where the task lands, as the target found it: what it means is the service's (`TaskService.drop`), or the Projects screen's. */
export type DropResult = DropTo | ProjectsDrop;

const PROJECTS_DROPS: ReadonlySet<string> = new Set(["projectRow", "projectGap", "projectsPlace"]);

export function isProjectsDrop(result: DropResult): result is ProjectsDrop {
	return PROJECTS_DROPS.has(result.kind);
}

/** Somewhere a dragged task may land: it previews while the pointer is over it and says what the drop means. */
/** A place to drop on: a list, the timeline, the plus's cancel ring; or the slots among a list's sections for a lifted section (`P`, `R`). */
export interface DropTarget<P = DragPayload, R = DropResult> {
	/** What it shows under the finger (a row to land on and its fill) must stay in sight: the float rides above the finger over it. */
	readonly clearsFinger?: boolean;
	hitTest(x: number, y: number, drag: P): boolean;
	preview(x: number, y: number, drag: P): void;
	/** Where a new task carried on the plus comes to rest, in client pixels, while a preview shows. A task's card lands on its card as drawn after the drop. */
	landing(): DOMRect | null;
	/** The finger has gone elsewhere, the drag goes on. */
	leave(): void;
	/** The drag is over. */
	clear(): void;
	drop(x: number, y: number, drag: P): R | null;
}

/** A drop's task stands where no card of it is drawn: in a folded project group, behind its header. */
export interface HeldOut {
	readonly behind: HTMLElement;
}

/** The card under the finger. */
export interface Float {
	moveTo(x: number, y: number): void;
	/** Over a target that `clearsFinger`: the float narrows to its own width and rides above the finger; off, it is held as grabbed again. */
	rideAbove?(on: boolean): void;
	/** Settles where the drop puts it. */
	land(rect: DOMRect): Promise<void>;
	/** Goes into `rect` and fades there: the drop is written into a part held out of sight under that header. */
	sink(rect: DOMRect): Promise<void>;
	/** Fades where it is: the drop is written but its card does not show. */
	vanish(): Promise<void>;
	/** Flies back to where it came from. */
	flyTo(rect: DOMRect): Promise<void>;
	remove(): void;
}

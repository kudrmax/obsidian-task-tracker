import type { LocalDate } from "../domain/Task";
import type { ColumnSections, DropColumn, DroppedTask, DropFrom, DropOrigin, DropTo, TaskChange, TaskKey, TaskStep } from "./contracts";
import type { ListPlace } from "./nesting";

/** A drop as the service reads it: a gap of a list column read as a list, a section of a list, or a place under a task. */
export type ReadDrop = Exclude<DropTo, { readonly kind: "place" }>;

/**
 * What a gap of `column` means, the column showing the sections `sections` (`columnSections`): a place under a task nests
 * there; another goes into its section of the list the column shows those of; in a column without sections before its
 * next task, or at the end (a null place: a column that places nothing in a gap).
 */
export function readDrop(to: DropTo, sections: (column: DropColumn) => ColumnSections | null): ReadDrop {
	if (to.kind !== "place") return to;
	return listDrop(to.column, to.place, to.place ? sections(to.column) : null);
}

function listDrop(column: DropColumn, place: ListPlace | null, sections: ColumnSections | null): ReadDrop {
	if (!place) return { kind: "list", column, before: null };
	if (place.kind === "subtask") return { kind: "nest", parent: place.parent, before: place.before };
	if (sections) return { kind: "group", list: sections.list, date: sections.date, group: place.group, before: place.before };
	return { kind: "list", column, before: place.before };
}

/** What a drop means for one task: a change `applyAll` knows, or a time set or a slot cleared, which only a task dropped alone takes. */
export type DropMove =
	| Extract<TaskChange, { readonly kind: "moveToGroup" | "nest" | "moveBefore" | "moveToList" | "moveToSoon" | "moveToEnd" }>
	| { readonly kind: "toTime"; readonly from: DropFrom; readonly start: number; readonly day: LocalDate }
	| { readonly kind: "clearSlot"; readonly place?: { readonly before: TaskKey | null; readonly date: LocalDate } };

/**
 * Whether `target` takes the tasks carried from `origins` (the one under the finger first): the day takes any; Soon all
 * but a task on the timeline; Inbox and Backlog only undated tasks, from Inbox, Backlog, Soon or the plus; the timeline
 * one task only.
 */
export function acceptsDrop(target: DropColumn | "timeline", origins: readonly DropOrigin[]): boolean {
	switch (target) {
		case "timeline":
			return origins.length <= 1;
		case "day":
			return true;
		case "soon":
			return origins.every((from) => from !== "timeline");
		case "inbox":
		case "backlog":
			return origins.every((from) => from === "inbox" || from === "backlog" || from === "soon" || from === "new");
	}
}

/** A list that shows sections places a task from anywhere, and any list a new task; another only a task from itself: one from elsewhere goes to its end. */
export function placesInGap(column: DropColumn, from: DropOrigin, grouped: boolean): boolean {
	return from === "new" || from === column || grouped;
}

/** The table of spec §5.1: what a task dragged from `from` and let go on `to` means, the day column showing `day`. */
function dropMove(from: DropFrom, to: ReadDrop, day: LocalDate): DropMove {
	switch (to.kind) {
		case "time":
			return { kind: "toTime", from, start: to.start, day };
		case "clearSlot":
			return { kind: "clearSlot" };
		case "group":
			return { kind: "moveToGroup", list: to.list, group: to.group, before: to.before, date: to.date ?? undefined };
		case "nest":
			return { kind: "nest", parent: to.parent, before: to.before };
		case "list":
			if (from === "timeline") return { kind: "clearSlot", place: { before: to.before, date: day } };
			if (to.column === "day") return from === "day" ? { kind: "moveBefore", before: to.before, date: day } : { kind: "moveToList", date: day };
			if (to.before) return { kind: "moveBefore", before: to.before, date: day };
			return from === "day" ? { kind: "moveToSoon", date: day } : { kind: "moveToEnd", section: to.column };
	}
}

/** What a drop of these tasks means: one task's move, its single call; several, the steps of one `applyAll`, a slot set or cleared for none of them. */
export type DropMoves = { readonly kind: "one"; readonly key: TaskKey; readonly move: DropMove } | { readonly kind: "many"; readonly steps: readonly TaskStep[] };

/** `TaskService.drop`'s meaning, the day column showing `day`. */
export function dropMoves(tasks: readonly DroppedTask[], to: ReadDrop, day: LocalDate): DropMoves {
	if (tasks.length === 1) return { kind: "one", key: tasks[0].key, move: dropMove(tasks[0].from, to, day) };
	const steps = tasks.flatMap(({ key, from }): TaskStep[] => {
		const move = dropMove(from, to, day);
		return move.kind === "toTime" || move.kind === "clearSlot" ? [] : [{ key, change: move }];
	});
	return { kind: "many", steps };
}

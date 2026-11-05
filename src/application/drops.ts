import type { LocalDate, Slot } from "../domain/Task";
import type { DropColumn, DroppedTask, DropFrom, DropOrigin, DropTo, TaskChange, TaskKey, TaskService, TaskStep } from "./contracts";

/** What a drop means for one task: a change `applyAll` knows, or a slot set or cleared, which only a task dropped alone takes. */
type DropMove =
	| Extract<TaskChange, { readonly kind: "moveToGroup" | "nest" | "moveBefore" | "moveToList" | "moveToSoon" | "moveToEnd" }>
	| { readonly kind: "setSlot"; readonly slot: Slot }
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
		case "left":
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
function dropMove(from: DropFrom, to: DropTo, day: LocalDate): DropMove {
	switch (to.kind) {
		case "slot":
			return { kind: "setSlot", slot: to.slot };
		case "clearSlot":
			return { kind: "clearSlot" };
		case "group":
			return { kind: "moveToGroup", list: to.list, group: to.group, before: to.before, date: to.date ?? undefined };
		case "nest":
			return { kind: "nest", parent: to.parent, before: to.before };
		case "list":
			if (from === "timeline") return { kind: "clearSlot", place: { before: to.before, date: day } };
			if (to.column === "left") return from === "left" ? { kind: "moveBefore", before: to.before, date: day } : { kind: "moveToList", date: day };
			if (to.before) return { kind: "moveBefore", before: to.before, date: day };
			return from === "left" ? { kind: "moveToSoon", date: day } : { kind: "moveToEnd", section: to.column };
	}
}

/** One task's move as the single call of its name. */
function moveOne(service: TaskService, key: TaskKey, move: DropMove): Promise<void> {
	switch (move.kind) {
		case "setSlot":
			return service.setSlot(key, move.slot);
		case "clearSlot":
			return service.clearSlot(key, move.place);
		case "moveToGroup":
			return service.moveToGroup(key, move.list, move.group, move.before, move.date);
		case "nest":
			return service.nest(key, move.parent, move.before);
		case "moveBefore":
			return service.moveBefore(key, move.before, move.date);
		case "moveToList":
			return service.moveToList(key, move.date);
		case "moveToSoon":
			return service.moveToSoon(key, move.date);
		case "moveToEnd":
			return service.moveToEnd(key, move.section);
	}
}

/** `TaskService.drop` on any service: one task as its single call, several as one `applyAll`, a slot set or cleared for none of them. */
export function runDrop(service: TaskService, tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void> {
	if (tasks.length === 1) return moveOne(service, tasks[0].key, dropMove(tasks[0].from, to, day));
	const steps = tasks.flatMap(({ key, from }): TaskStep[] => {
		const move = dropMove(from, to, day);
		return move.kind === "setSlot" || move.kind === "clearSlot" ? [] : [{ key, change: move }];
	});
	return service.applyAll(steps);
}

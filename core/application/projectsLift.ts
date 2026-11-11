import type { DropFrom, ProjectsDrop, ProjectsLifted, TaskItem } from "./contracts";

/** The funnel's column a task is dragged from: one on a time from the timeline, one with a day (Now's, a dated Soon task) from that day's list; a closed one from none. */
export function originOf(item: Pick<TaskItem, "list" | "slot" | "dueDate">): DropFrom | null {
	if (item.list === "done") return null;
	if (item.slot !== null) return "timeline";
	if (item.list === "now" || (item.list === "soon" && item.dueDate !== null)) return "day";
	return item.list;
}

/** The task as its card is lifted. */
export function liftedOf(item: TaskItem): ProjectsLifted {
	return { id: item.id, list: item.list, origin: originOf(item) };
}

/** What a drop of the card takes: its task, the project it is shown under, and the task as lifted. */
export function dropOf(item: TaskItem, from: string | null): ProjectsDrop {
	return { key: item.key, from, lifted: liftedOf(item) };
}

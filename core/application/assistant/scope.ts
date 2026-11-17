import type { SectionKey, TaskItem } from "../contracts";
import type { ListedColumn, ListedTasks } from "./tasks";

/** Which tasks an action sends. */
export type TaskScope =
	/** The open tasks of these columns as the screen draws them on today, in this order: a dated Soon task stands on its day, in neither. */
	| { readonly kind: "columns"; readonly columns: readonly ListedColumn[] }
	/** The target's project, with its subprojects' tasks. */
	| { readonly kind: "project" }
	/** The tasks the button was pressed on, with their subtasks. */
	| { readonly kind: "target" }
	/** Every open task. */
	| { readonly kind: "all" };

/** Where a button is pressed: «⋯» on nothing; later a task's menu, Select, a project. */
export type AssistantPlace = "more" | "task" | "selection" | "project";

/** Where a button is pressed and on what. */
export interface AssistantTarget {
	readonly place: AssistantPlace;
	/** "task", "selection": the tasks' ids (`TaskItem.id`). */
	readonly taskIds?: readonly string[];
	/** "project": the project's name. */
	readonly projectId?: string;
}

/** The lists whose open tasks «all» sends, in the order sent. */
export const OPEN_LISTS: readonly SectionKey[] = ["now", "soon", "inbox", "backlog"];

/** What a scope reads of its target: the places that give it. */
export const SCOPE_NEEDS: Readonly<Record<TaskScope["kind"], (target: AssistantTarget) => boolean>> = {
	columns: () => true,
	all: () => true,
	project: (target) => typeof target.projectId === "string" && target.projectId !== "",
	target: (target) => (target.taskIds?.length ?? 0) > 0,
};

/** The target a place gives, as the scope test reads it: «⋯» nothing, a task or Select some tasks, a project its name. */
export function targetOfPlace(place: AssistantPlace): AssistantTarget {
	if (place === "task" || place === "selection") return { place, taskIds: ["t"] };
	if (place === "project") return { place, projectId: "p" };
	return { place };
}

/** The open tasks a scope sends, each with its open subtasks below it (`TaskItem.subtasks`), in the order sent. */
export function tasksIn(scope: TaskScope, target: AssistantTarget, listed: ListedTasks): readonly TaskItem[] {
	const open = (lists: readonly SectionKey[]) => lists.flatMap((list) => listed.lists[list].filter((item) => item.open));
	switch (scope.kind) {
		case "columns":
			return scope.columns.flatMap((column) => listed.columns[column].filter((item) => item.open));
		case "all":
			return open(OPEN_LISTS);
		case "project":
			return open(OPEN_LISTS).filter((item) => item.projects.some((project) => project.path.includes(target.projectId ?? "")));
		case "target":
			return targeted(open(OPEN_LISTS), target.taskIds ?? []);
	}
}

/** The open tasks named, at any depth, a task named under another one named sent once, under it. */
function targeted(items: readonly TaskItem[], ids: readonly string[]): readonly TaskItem[] {
	const wanted = new Set(ids);
	const found: TaskItem[] = [];
	const walk = (item: TaskItem): void => {
		if (wanted.has(item.id)) found.push(item);
		else item.subtasks.forEach(walk);
	};
	items.forEach(walk);
	return found;
}

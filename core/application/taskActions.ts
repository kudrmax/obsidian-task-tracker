import { addDays } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { MenuFrom, MenuProject, MenuSections, MenuStatusId, TaskItem } from "./contracts";

/** Which menu: one task's, opened from `from`, or the bulk menu of the picked tasks. */
export type MenuOf = { readonly kind: "task"; readonly from: MenuFrom } | { readonly kind: "bulk" };

/** Every action Max can take on a task, wherever it is offered. */
export type TaskActionId =
	| "done"
	| "progress"
	| "wontDo"
	| "stop"
	| "level"
	| "label"
	| "today"
	| "tomorrow"
	| "pickDate"
	| "repeat"
	| "reminder"
	| "rename"
	| "description"
	| "project"
	| "section"
	| "subtask"
	| "newSection"
	| "indent"
	| "outdent"
	| "firstStep"
	| "openFull"
	| "openInObsidian"
	| "delete";

/** The places that offer task actions: one task's menu, the bulk menu, the field (a new task and a rename are one), the full screen's own controls. */
export type Surface = "taskMenu" | "bulkMenu" | "field" | "fullScreen";

/** A task menu's groups, top to bottom: the statuses, the levels, the labels, the task's copy, When, Edit, the rows, Delete. */
export type TaskMenuGroup = "statuses" | "levels" | "labels" | "copy" | "when" | "edit" | "rows" | "remove";
/** The field's bar: the new section switch, the shifts, the flag (levels and labels in its panel), the marks, the place. */
export type FieldGroup = "mode" | "shifts" | "flag" | "marks" | "place";
/** The full screen's own controls: the circle by the title, the description under it, the plus of the subtasks. */
export type FullScreenGroup = "title" | "description" | "subtasks";

/** How an action stands for the task at hand: offered, offered and not pressable, or not offered this time. */
export type Offer = "shown" | "disabled" | "hidden";

/** What a menu knows when it decides: the tasks, which menu, today, what its pages offer. */
export interface MenuContext {
	readonly items: readonly TaskItem[];
	/** The tasks the status tiles write: a folded card's shown step, else the task itself. */
	readonly statusTasks: readonly TaskItem[];
	readonly of: MenuOf;
	readonly today: LocalDate;
	/** The sections the menu offers, null where it offers none. */
	readonly sections: MenuSections | null;
	readonly project: MenuProject;
	/** How many levels and labels the settings have. */
	readonly levels: number;
	readonly labels: number;
}

/** What the field knows when it decides: what it writes, where it stands, what it may do there. */
export interface FieldContext {
	/** It writes a task, not a new section's name. */
	readonly task: boolean;
	/** The task it renames; null for a new one. */
	readonly renaming: TaskItem | null;
	/** It writes a task of the top level: a subtask's project and place are its parent's. */
	readonly topLevel: boolean;
	/** It has a place of its own: a top-level task in a list. */
	readonly place: boolean;
	readonly levels: number;
	readonly labels: number;
	/** It stands in a list and may shift a level at all; then whether it can go in or out now. */
	readonly indents: boolean;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** It may switch to a new section's name: a new task in a column that shows sections. */
	readonly maySection: boolean;
}

/** What the full screen knows: the task it shows. */
export interface FullScreenContext {
	readonly item: TaskItem;
}

/** An action's place on a surface: its group, its order in the group, and when it is offered. */
export interface Place<G extends string, C> {
	readonly group: G;
	readonly order: number;
	readonly offer: (ctx: C) => Offer;
	/** It asks first, in place of its group. */
	readonly asks?: (ctx: C) => boolean;
}

/** The action is not on this surface, on purpose: why, in Max's words. */
export interface Absent {
	readonly absent: string;
}

export type Placement<G extends string, C> = Place<G, C> | Absent;

/** One action: its name, and for every surface its place or why it has none. A surface left out does not compile. */
export interface ActionSpec {
	readonly name: string;
	readonly places: {
		readonly taskMenu: Placement<TaskMenuGroup, MenuContext>;
		readonly bulkMenu: Placement<TaskMenuGroup, MenuContext>;
		readonly field: Placement<FieldGroup, FieldContext>;
		readonly fullScreen: Placement<FullScreenGroup, FullScreenContext>;
	};
}

const shown = (offered: boolean): Offer => (offered ? "shown" : "hidden");
const one = (ctx: MenuContext): boolean => ctx.of.kind === "task";
const always = (): Offer => "shown";

const COLUMNS: ReadonlySet<MenuFrom> = new Set<MenuFrom>(["day", "soon", "inbox", "backlog"]);
/** Where First step is offered: a card of a list column or of the timeline, the cards a folded task is drawn on. */
const FIRST_STEP_FROM: ReadonlySet<MenuFrom> = new Set<MenuFrom>([...COLUMNS, "timeline"]);

const fromOf = (ctx: MenuContext): MenuFrom | null => (ctx.of.kind === "task" ? ctx.of.from : null);

/** A day tile is offered while one of the tasks that may be put off doesn't stand on that day already. */
function offersDay(ctx: MenuContext, days: number): boolean {
	const date = addDays(ctx.today, days);
	return ctx.items.some((item) => item.can.postpone && item.day !== date);
}

const levelOffer = (count: number, holders: boolean): Offer => (count === 0 ? "hidden" : holders ? "shown" : "disabled");

const ONE_TASK = "It is about one task: each picked task has its own.";
const NOT_WRITTEN = "The task isn't written yet, or a rename edits only its title and marks; Escape cancels a new task.";
const IN_THE_MENU = "In the task's menu (⋯) on the full screen.";
const IN_THE_PLACE = "The field's place button sends the task to a list or a day.";

/**
 * Every task action and where it is offered (Max, 2026-11-20): one row per action, one cell per surface, each a place or
 * a reason it is absent. The menus (`taskMenu`), the field's bar (`QuickEntry.state.bar`) and the full screen read it.
 */
export const TASK_ACTIONS = {
	done: {
		name: "Done",
		places: {
			taskMenu: { group: "statuses", order: 0, offer: always },
			bulkMenu: { group: "statuses", order: 0, offer: always },
			field: { absent: NOT_WRITTEN },
			fullScreen: { group: "title", order: 0, offer: always },
		},
	},
	progress: {
		name: "In progress",
		places: {
			taskMenu: { group: "statuses", order: 1, offer: always },
			bulkMenu: { group: "statuses", order: 1, offer: always },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	wontDo: {
		name: "Won't do",
		places: {
			taskMenu: { group: "statuses", order: 2, offer: always, asks: one },
			bulkMenu: { group: "statuses", order: 2, offer: always },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	stop: {
		name: "Stop",
		places: {
			taskMenu: { group: "statuses", order: 3, offer: (ctx) => shown(ctx.statusTasks.every((item) => item.can.stop)), asks: one },
			bulkMenu: { absent: "Stopping a repeat ends one task's series; it is asked for one task at a time." },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	level: {
		name: "Priority",
		places: {
			taskMenu: { group: "levels", order: 0, offer: (ctx) => levelOffer(ctx.levels, ctx.items.some((item) => item.can.setPriority)) },
			bulkMenu: { group: "levels", order: 0, offer: (ctx) => levelOffer(ctx.levels, ctx.items.some((item) => item.can.setPriority)) },
			field: { group: "flag", order: 0, offer: (ctx) => shown(ctx.task && ctx.levels > 0) },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	label: {
		name: "Labels",
		places: {
			taskMenu: { group: "labels", order: 0, offer: (ctx) => levelOffer(ctx.labels, ctx.items.some((item) => item.can.setLabels)) },
			bulkMenu: { group: "labels", order: 0, offer: (ctx) => levelOffer(ctx.labels, ctx.items.some((item) => item.can.setLabels)) },
			field: { group: "flag", order: 1, offer: (ctx) => shown(ctx.task && ctx.labels > 0) },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	today: {
		name: "Today",
		places: {
			taskMenu: { group: "when", order: 0, offer: (ctx) => shown(offersDay(ctx, 0)) },
			bulkMenu: { group: "when", order: 0, offer: (ctx) => shown(offersDay(ctx, 0)) },
			field: { absent: IN_THE_PLACE },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	tomorrow: {
		name: "Tomorrow",
		places: {
			taskMenu: { group: "when", order: 1, offer: (ctx) => shown(offersDay(ctx, 1)) },
			bulkMenu: { group: "when", order: 1, offer: (ctx) => shown(offersDay(ctx, 1)) },
			field: { absent: IN_THE_PLACE },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	pickDate: {
		name: "Pick a date",
		places: {
			taskMenu: { group: "when", order: 2, offer: (ctx) => shown(ctx.items.some((item) => item.can.postpone)) },
			bulkMenu: { group: "when", order: 2, offer: (ctx) => shown(ctx.items.some((item) => item.can.postpone)) },
			field: { group: "place", order: 0, offer: (ctx) => shown(ctx.task && ctx.place) },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	repeat: {
		name: "Repeat",
		places: {
			taskMenu: { group: "when", order: 3, offer: (ctx) => shown(ctx.items.every((item) => item.repeatable)) },
			bulkMenu: { group: "when", order: 3, offer: (ctx) => shown(ctx.items.some((item) => item.repeatable)) },
			field: { group: "marks", order: 1, offer: (ctx) => shown(ctx.task && (ctx.renaming?.repeatable ?? true)) },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	reminder: {
		name: "Reminder",
		places: {
			taskMenu: { group: "when", order: 4, offer: (ctx) => shown(ctx.items.every((item) => item.can.remind)) },
			bulkMenu: { absent: "A reminder belongs to one task on a time; each is set in its own menu." },
			field: { absent: "A reminder belongs to a task on a time; it is set in the task's menu once the task is written." },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	rename: {
		name: "Rename",
		places: {
			taskMenu: { group: "edit", order: 0, offer: always },
			bulkMenu: { absent: ONE_TASK },
			field: { absent: "The field is the title itself: typing in it is the rename." },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	description: {
		name: "Description",
		places: {
			taskMenu: { group: "edit", order: 1, offer: (ctx) => shown(ctx.items.every((item) => item.can.addDescription)) },
			bulkMenu: { absent: ONE_TASK },
			field: { group: "marks", order: 2, offer: (ctx) => shown(ctx.task) },
			fullScreen: { group: "description", order: 0, offer: always },
		},
	},
	project: {
		name: "Project",
		places: {
			taskMenu: { group: "edit", order: 2, offer: (ctx) => (ctx.project.disabled ? "disabled" : "shown") },
			bulkMenu: { group: "edit", order: 2, offer: (ctx) => (ctx.project.disabled ? "disabled" : "shown") },
			field: { group: "marks", order: 0, offer: (ctx) => shown(ctx.task && ctx.topLevel) },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	section: {
		name: "Section",
		places: {
			taskMenu: { group: "edit", order: 3, offer: (ctx) => shown(ctx.sections !== null) },
			bulkMenu: { group: "edit", order: 3, offer: (ctx) => shown(ctx.sections !== null) },
			field: { absent: "The field stands in the section it is typed in; a drag or the task's menu moves the task to another." },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	subtask: {
		name: "Subtask",
		places: {
			taskMenu: { group: "edit", order: 4, offer: (ctx) => shown(fromOf(ctx) !== "stack") },
			bulkMenu: { absent: ONE_TASK },
			field: { absent: "Enter, then Tab, types a subtask under the task just typed." },
			fullScreen: { group: "subtasks", order: 0, offer: always },
		},
	},
	newSection: {
		name: "New section",
		places: {
			taskMenu: { absent: "The Section page offers «New section…» for the task." },
			bulkMenu: { absent: "A new section is named for one task, from its Section page or the field." },
			field: { group: "mode", order: 0, offer: (ctx) => shown(ctx.maySection) },
			fullScreen: { absent: "The full screen shows one task's subtasks, which have no sections." },
		},
	},
	indent: {
		name: "Move in",
		places: {
			taskMenu: { absent: "A written task is moved in by dragging it onto another." },
			bulkMenu: { absent: "Picked tasks are moved by dragging them." },
			field: { group: "shifts", order: 1, offer: (ctx) => (!ctx.indents ? "hidden" : ctx.canIndent ? "shown" : "disabled") },
			fullScreen: { absent: "Subtasks on the full screen are moved by dragging them." },
		},
	},
	outdent: {
		name: "Move out",
		places: {
			taskMenu: { absent: "A written task is moved out by dragging it." },
			bulkMenu: { absent: "Picked tasks are moved by dragging them." },
			field: { group: "shifts", order: 0, offer: (ctx) => (!ctx.indents ? "hidden" : ctx.canOutdent ? "shown" : "disabled") },
			fullScreen: { absent: "Subtasks on the full screen are moved by dragging them." },
		},
	},
	firstStep: {
		name: "First step",
		places: {
			taskMenu: { group: "rows", order: 0, offer: (ctx) => shown(ctx.items.every((item) => item.can.firstStep) && FIRST_STEP_FROM.has(fromOf(ctx) ?? "full")) },
			bulkMenu: { absent: ONE_TASK },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: "The full screen's plus types the task's subtasks, its first step among them." },
		},
	},
	openFull: {
		name: "Open full screen",
		places: {
			taskMenu: { group: "rows", order: 1, offer: (ctx) => shown(fromOf(ctx) !== "full") },
			bulkMenu: { absent: ONE_TASK },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: "The full screen already shows the task." },
		},
	},
	openInObsidian: {
		name: "Open in Obsidian",
		places: {
			taskMenu: { group: "rows", order: 2, offer: always },
			bulkMenu: { absent: ONE_TASK },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
	delete: {
		name: "Delete",
		places: {
			taskMenu: { group: "remove", order: 0, offer: always, asks: one },
			bulkMenu: { group: "remove", order: 0, offer: always },
			field: { absent: NOT_WRITTEN },
			fullScreen: { absent: IN_THE_MENU },
		},
	},
} as const satisfies Record<TaskActionId, ActionSpec>;

type Actions = typeof TASK_ACTIONS;

/** The actions a surface offers at all: the ids whose cell there is a place, not a reason. A frontend draws them with an exhaustive `Record` over this. */
export type ActionOn<S extends Surface> = { [K in TaskActionId]: Actions[K]["places"][S] extends Absent ? never : K }[TaskActionId];
export type TaskMenuActionId = ActionOn<"taskMenu">;
export type BulkActionId = ActionOn<"bulkMenu">;
export type FieldActionId = ActionOn<"field">;
export type FullScreenActionId = ActionOn<"fullScreen">;

/** Every action, in the table's order. */
export const TASK_ACTION_IDS = Object.keys(TASK_ACTIONS) as readonly TaskActionId[];

/** The groups of each surface, in the order they are drawn. */
export const TASK_MENU_GROUPS: readonly TaskMenuGroup[] = ["statuses", "levels", "labels", "copy", "when", "edit", "rows", "remove"];
export const FIELD_GROUPS: readonly FieldGroup[] = ["mode", "shifts", "flag", "marks", "place"];
export const FULL_SCREEN_GROUPS: readonly FullScreenGroup[] = ["title", "description", "subtasks"];

/** An action as a surface offers it now: `disabled` shown and not pressable, `asks` asking first. */
export interface OfferedAction<Id extends TaskActionId = TaskActionId> {
	readonly id: Id;
	readonly disabled: boolean;
	readonly asks: boolean;
}

export interface ActionGroup<G extends string, Id extends TaskActionId = TaskActionId> {
	readonly group: G;
	readonly actions: readonly OfferedAction<Id>[];
}

/** The cell of `id` on `surface`. */
export function placementOf<S extends Surface>(id: TaskActionId, surface: S): ActionSpec["places"][S] {
	return (TASK_ACTIONS as Record<TaskActionId, ActionSpec>)[id].places[surface];
}

/** The reason `id` is absent from `surface`, or null where it has a place. */
export function absentReason(id: TaskActionId, surface: Surface): string | null {
	const cell = placementOf(id, surface);
	return "absent" in cell ? cell.absent : null;
}

/** What `surface` offers for `ctx`, group by group in `order`, each group's actions by their order; an empty group is left out. */
function arrange<G extends string, C, Id extends TaskActionId>(surface: Surface, order: readonly G[], ctx: C): readonly ActionGroup<G, Id>[] {
	const offered = TASK_ACTION_IDS.flatMap((id) => {
		const cell = placementOf(id, surface) as Placement<G, C>;
		if ("absent" in cell) return [];
		const offer = cell.offer(ctx);
		if (offer === "hidden") return [];
		return [{ id: id as Id, group: cell.group, order: cell.order, disabled: offer === "disabled", asks: cell.asks?.(ctx) ?? false }];
	});
	return order.flatMap((group) => {
		const actions = offered
			.filter((action) => action.group === group)
			.sort((a, b) => a.order - b.order)
			.map(({ id, disabled, asks }) => ({ id, disabled, asks }));
		return actions.length > 0 ? [{ group, actions }] : [];
	});
}

/** One task's menu or the bulk menu, as the table places its actions. */
export function menuActions(ctx: MenuContext): readonly ActionGroup<TaskMenuGroup>[] {
	return arrange(ctx.of.kind === "task" ? "taskMenu" : "bulkMenu", TASK_MENU_GROUPS, ctx);
}

/** The field's bar, as the table places its actions. */
export function fieldActions(ctx: FieldContext): readonly ActionGroup<FieldGroup, FieldActionId>[] {
	return arrange("field", FIELD_GROUPS, ctx);
}

/** The full screen's own controls for the task it shows. */
export function fullScreenActions(ctx: FullScreenContext): readonly ActionGroup<FullScreenGroup, FullScreenActionId>[] {
	return arrange("fullScreen", FULL_SCREEN_GROUPS, ctx);
}

/** The status tile an action writes (`pickStatus`), for the status actions: the progress tile is In progress, or Stop progress once every task is. */
export function statusOf(id: TaskActionId, progress: Extract<MenuStatusId, "inProgress" | "stopProgress">): MenuStatusId | null {
	const statuses: Partial<Record<TaskActionId, MenuStatusId>> = { done: "done", progress, wontDo: "wontDo", stop: "stop" };
	return statuses[id] ?? null;
}

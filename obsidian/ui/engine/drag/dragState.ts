import type { DropColumn, DropFrom, GapPlace, GroupedList, GroupName, TaskKey } from "../../../../core/application/contracts";

/** What a finger carries: a task (with its subtasks), the plus, or a section's header with its tasks. */
export type Lifted =
	| {
			readonly kind: "task";
			readonly id: string;
			readonly key: TaskKey;
			readonly from: DropFrom;
			/** The ids of the task and of every subtask under it: they leave their list with it. */
			readonly ids: readonly string[];
			/** Where it stood in its list, as a place to drop (the core's gap); null for a block of the timeline. */
			readonly home: { readonly column: DropColumn; readonly gap: GapPlace } | null;
			/** How many layers its subtasks draw under the carried card (0 to 2). */
			readonly layers: number;
	  }
	| { readonly kind: "plus" }
	| {
			readonly kind: "section";
			readonly column: DropColumn;
			readonly list: GroupedList;
			readonly group: GroupName;
			readonly groupId: string;
			/** The section's place among the list's sections it was lifted from. */
			readonly home: number;
	  };

/** Where the carried thing would land now: a gap of a list, a column's title, a time of the timeline, a slot between sections; `home` nowhere new. */
export type Aim =
	| { readonly kind: "gap"; readonly column: DropColumn; readonly gap: GapPlace }
	| { readonly kind: "title"; readonly column: DropColumn }
	| { readonly kind: "time"; readonly start: number }
	| { readonly kind: "slot"; readonly column: DropColumn; readonly slot: number }
	| { readonly kind: "home" };

/**
 * A drag under way: what is carried and where it would land. `dropping`: let go, the carried copy flies to its place and
 * the card waits there unseen until it lands.
 */
export interface Drag {
	readonly lifted: Lifted;
	readonly aim: Aim;
	readonly phase: "carry" | "dropping";
	/** Let go, the screen the drop leaves is drawn (or nothing was written): the card stands at its place, unseen. */
	readonly drawn: boolean;
	/** Let go, the carried copy has reached the card's place. The drag is over once both are true. */
	readonly flown: boolean;
}

/** The id a draggable registers with dnd-kit: a task's card or block, the plus, a section's header. */
export const dragId = {
	task: (id: string) => `task:${id}`,
	block: (id: string) => `block:${id}`,
	plus: "plus",
	section: (column: DropColumn, groupId: string) => `section:${column}:${groupId}`,
} as const;

/** The id a drop target registers: a list, a column's title, the timeline. */
export const dropId = {
	list: (column: DropColumn) => `list:${column}`,
	title: (column: DropColumn) => `title:${column}`,
	timeline: "timeline",
} as const;

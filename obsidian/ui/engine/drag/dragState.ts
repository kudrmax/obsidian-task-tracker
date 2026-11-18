import type { Gap } from "../mechanics/drop";
import type { ListId } from "../port";

/** What a finger carries: a task (with its subtasks) from a list or the timeline, or a section by its header with its tasks. */
export type Lifted =
	| {
			readonly kind: "task";
			readonly id: string;
			/** The task and every subtask under it: they leave their list with it. */
			readonly ids: readonly string[];
			/** Where it stood in its list, as a gap; null for a block of the timeline. */
			readonly home: { readonly list: ListId; readonly gap: Gap } | null;
			/** How many layers its subtasks draw under the carried card (0 to 2). */
			readonly layers: number;
	  }
	| {
			readonly kind: "section";
			readonly list: ListId;
			readonly section: string;
			readonly title: string | null;
			/** Its place among its list's sections. */
			readonly home: number;
	  };

/** Where the carried thing would land now: a list's gap, a list's title, a minute of the timeline, a place among sections; `home` nowhere new. */
export type Aim =
	| { readonly kind: "gap"; readonly list: ListId; readonly gap: Gap }
	| { readonly kind: "title"; readonly list: ListId }
	| { readonly kind: "time"; readonly minute: number }
	| { readonly kind: "slot"; readonly list: ListId; readonly slot: number }
	| { readonly kind: "home" };

/**
 * A drag under way and what is carried. `dropping`: let go, the copy flies to its place. `drawn`: the screen the drop
 * leaves is drawn (or nothing was written); `flown`: the copy has landed. The drag is over once both are.
 */
export interface Drag {
	readonly lifted: Lifted;
	readonly aim: Aim;
	readonly phase: "carry" | "dropping";
	readonly drawn: boolean;
	readonly flown: boolean;
}

/** The id a draggable registers with dnd-kit: a task's card or block, a section's header. */
export const dragId = {
	task: (id: string) => `task:${id}`,
	block: (id: string) => `block:${id}`,
	section: (id: string) => `section:${id}`,
} as const;

/** The id a drop target registers: a list, a list's title, the timeline. */
export const dropId = {
	list: (list: ListId) => `list:${list}`,
	title: (list: ListId) => `title:${list}`,
	timeline: "timeline",
} as const;

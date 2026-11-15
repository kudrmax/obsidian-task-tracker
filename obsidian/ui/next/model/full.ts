import type { FullTree, TaskItem, TaskKey } from "../../../../core/application/contracts";
import { type Answers, type Need, resultOf } from "./answers";

/** A task on the full card: who it is (P6 pins hold ids), and its key and text as last read, which the door finds it by. */
export interface FullTask {
	readonly id: string;
	readonly key: TaskKey;
	readonly text: string;
}

/** What the description's rules keep between calls (`description.*`): the description as the file had it, and whether anything was typed since. */
export interface DescriptionState {
	readonly file: string | null;
	readonly typed: boolean;
}

/**
 * The description being edited on the full card. The editor owns its text while it lives (P1, typed text): the model
 * keeps what the editor last reported (`text`), never writes it back but when the core's rules replace it (`replace`).
 */
export interface Description {
	/** The task whose description the editor shows; another task on the card makes a new editor. */
	readonly id: string;
	readonly state: DescriptionState;
	/** What the editor starts with. */
	readonly start: string;
	/** The editor's text as it last reported it. */
	readonly text: string;
	/** A write of what was typed waits for the pause after the last key. */
	readonly pending: boolean;
	readonly focused: boolean;
	/** A text the rules gave the editor in place of its own (a change made elsewhere), with a count so the same text twice is two replacements. */
	readonly replace: { readonly text: string; readonly seq: number } | null;
}

/**
 * The full card of a task over the block (the old `FullScreen`): pinned to the task by its id (P6), its content read
 * anew whenever the replica changes, closing when the task is gone. The tasks opened one inside another, the one shown
 * last; the description's editor.
 */
export interface FullLayer {
	readonly kind: "full";
	readonly closing: boolean;
	/** The task shown: the last of `stack`. */
	readonly id: string;
	readonly stack: readonly FullTask[];
	readonly description: Description | null;
	/** The caret goes to the description's end once its editor stands (Add description). */
	readonly focusDescription: boolean;
}

/** The full card's messages. `open`: from a menu (full screen, Add description, which puts the caret in the description) or a find. */
export type FullMsg =
	| { readonly kind: "open"; readonly id: string; readonly description: boolean; readonly task?: FullTask }
	| { readonly kind: "close" }
	/** The parent row: back to the task the one shown belongs to. */
	| { readonly kind: "up" }
	/** The project line: the Projects screen on the project, as a card's folder opens it. */
	| { readonly kind: "project" }
	/** A subtask's card: its menu. */
	| { readonly kind: "subtask"; readonly id: string }
	/** A subtask's circle: done, or open again. */
	| { readonly kind: "tick"; readonly id: string }
	/** The capsule's ⋯: the shown task's own menu. */
	| { readonly kind: "more" }
	/** The plus: a new subtask, last under the shown task. */
	| { readonly kind: "add" }
	/** Done in the bar: the keyboard goes, what was typed is written. */
	| { readonly kind: "done" }
	/** The description's editor (an island): opened by the rules, typed in, focused, left. */
	| { readonly kind: "drafted"; readonly id: string; readonly state: DescriptionState; readonly text: string }
	| { readonly kind: "typed"; readonly text: string }
	| { readonly kind: "editorFocus"; readonly focused: boolean }
	/** The pause after the last key has passed: what was typed is written. */
	| { readonly kind: "saveDue" }
	| { readonly kind: "saved"; readonly state: DescriptionState; readonly write: boolean; readonly id: string; readonly key: TaskKey; readonly text: string }
	| { readonly kind: "read"; readonly id: string; readonly state: DescriptionState; readonly replace: string | null };

/** Waits this long after the last key before the description is written, so a word is one write, not a letter each. */
export const DESCRIPTION_PAUSE_MS = 600;

const FULL_TASK = "full:task";
const FULL_TREE = "full:tree";

/** The full card on top of the block's layers, if one is open; a closing one still draws while it fades. */
export function fullLayer(layers: readonly { readonly kind: string }[]): FullLayer | null {
	const found = layers.filter((layer): layer is FullLayer => layer.kind === "full");
	return found.slice(-1).find(() => true) ?? null;
}

/** The task shown on the full card. */
export function shownTask(layer: FullLayer): FullTask | null {
	return layer.stack.slice(-1).find(() => true) ?? null;
}

/** The views the full card needs (P2): its task found by id where it stands now, and the tree of its subtasks. */
export function fullNeeds(layer: FullLayer | null, answers: Answers): readonly Need[] {
	const task = layer ? shownTask(layer) : null;
	if (!layer || layer.closing || !task) return [];
	const needs: Need[] = [{ key: FULL_TASK, method: "tasks.find", args: [task.key, task.text] }];
	const item = fullItem(answers);
	if (item && item.id === task.id) needs.push({ key: FULL_TREE, method: "tasks.fullTree", args: [item] });
	return needs;
}

/** The shown task as the core reads it now; null while it is not read, or gone. */
export function fullItem(answers: Answers): TaskItem | null {
	return resultOf<TaskItem | null>(answers, FULL_TASK);
}

export function fullTree(answers: Answers): FullTree | null {
	return resultOf<FullTree>(answers, FULL_TREE);
}

/** Whether the read of the shown task has answered and found nothing: it is gone (deleted, or rewritten past its id). */
export function fullTaskGone(answers: Answers): boolean {
	const answer = answers.get(FULL_TASK);
	return answer !== undefined && (!answer.ok || answer.result === null);
}

/** A task as the full card holds it. */
export function fullTaskOf(item: Pick<TaskItem, "id" | "key" | "text">): FullTask {
	return { id: item.id, key: item.key, text: item.text };
}

/** The description's editor the full card asks for: whose, what it starts with, a text the rules gave in its place; null for none. */
export function descriptionIsland(layers: readonly { readonly kind: string }[]): { readonly key: string; readonly text: string; readonly replace: Description["replace"] } | null {
	const layer = fullLayer(layers);
	const description = layer && !layer.closing ? layer.description : null;
	return description ? { key: description.id, text: description.start, replace: description.replace } : null;
}

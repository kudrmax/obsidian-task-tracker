import { type BlockLists, type BlockModel, canUndo, currentLists, shownLists, taskById, viewChoice } from "../model/block";
import { type Command, write } from "../model/commands";
import { type Layer, topLayer } from "../model/layers";
import type { BlockMsg } from "../model/messages";
import { assertNever } from "../model/assertNever";
import { remapIds } from "./ids";
import { actMessage } from "./acts";

export type BlockCommand = Command<BlockMsg>;
export type Step = readonly [BlockModel, readonly BlockCommand[]];

const failed = (error: { readonly code: string; readonly message: string }): BlockMsg => ({ kind: "failed", error });

const contextOf = (lists: BlockLists): string | null => (lists.kind === "none" ? null : lists.context);

/** The next drawing's cause (P5): the same context moves what moved; another one, or the first, is drawn in place. */
function withMotion(before: BlockModel, after: BlockModel): BlockModel {
	const was = shownLists(before);
	const next = shownLists(after);
	if (was === next) return after;
	const context = contextOf(next);
	const cause = before.motion.context !== null && context === before.motion.context ? "move" : "replace";
	return { ...after, motion: { seq: before.motion.seq + 1, cause, context } };
}

/** A layer opens over the block. */
function open(model: BlockModel, layer: Layer): BlockModel {
	return { ...model, layers: [...model.layers, layer] };
}

/**
 * The top layer begins to close: its close motion runs, and the lists under it are pinned as they stand now, so a write
 * its pick made shows once the sheet has gone (P6, R10).
 */
export function closeTop(model: BlockModel): BlockModel {
	const top = topLayer(model.layers);
	if (!top || top.closing) return model;
	const layers = [...model.layers.slice(0, -1), { ...top, closing: true } as Layer];
	return { ...model, layers, pinned: model.pinned ?? currentLists(model) };
}

/** A pick that writes: the call runs now (its outcome is in the replica at once), the sheet closes over the lists as they stood. */
function pickWrite(model: BlockModel, method: string, args: readonly unknown[]): Step {
	return [closeTop(model), [write(method, args, failed)]];
}

/**
 * A note's block (P2): the model changes only here, one message at a time; work outside it is a command. Every rule
 * of the tasks is the core's: this decides only which call a gesture means and which layer stands.
 */
export function updateBlock(model: BlockModel, msg: BlockMsg): Step {
	const [next, commands] = step(model, msg);
	return [withMotion(model, next), commands];
}

function step(model: BlockModel, msg: BlockMsg): Step {
	switch (msg.kind) {
		case "acted": {
			const meant = actMessage(model, msg.act);
			return meant ? step(model, meant) : [model, []];
		}
		case "views":
			return [{ ...model, answers: msg.answers }, []];
		case "rebased":
			return [remapIds(model, msg.idMap), []];
		case "undoTapped":
			if (!canUndo(model)) return [model, []];
			return [model, [undoStep("undo")]];
		case "key":
			if (msg.key === "find") return [model, []];
			return [model, [undoStep(msg.key)]];
		case "viewButtonTapped":
			if (!viewChoice(model)) return [model, []];
			return [open(model, { kind: "viewMenu", closing: false }), []];
		case "moreTapped":
			return [open(model, { kind: "moreMenu", closing: false }), []];
		case "modePicked":
			return pickWrite(model, "tasks.setNoteViewMode", [msg.mode]);
		case "subprojectsPicked":
			return pickWrite(model, "tasks.toggleSubprojects", []);
		case "layerDismissed":
			return [closeTop(model), []];
		case "layerGone": {
			const layers = model.layers.filter((layer, i) => !(layer.closing && i === model.layers.findIndex((l) => l.closing)));
			const still = layers.some((layer) => layer.closing) || model.carry !== null;
			return [{ ...model, layers, pinned: still ? model.pinned : null }, []];
		}
		case "cardTapped": {
			const task = taskById(model, msg.key);
			if (!task) return [model, []];
			if (msg.part === "counter") return [model, [write("tasks.toggleCollapsed", [task.key], failed)]];
			return [open(model, { kind: "taskMenu", closing: false, id: msg.key }), []];
		}
		case "linkTapped":
			return [model, [{ kind: "openLink", link: msg.link }]];
		case "plateTapped":
		case "plusTapped":
			return [model, []];
		case "searchPicked":
		case "selectPicked":
			return [closeTop(model), []];
		case "failed":
			return [model, [{ kind: "failure", error: msg.error }]];
		default:
			return assertNever(msg);
	}
}

/** Undo and redo: a step whose lines were edited since by hand or through Sync is said and dropped. */
function undoStep(way: "undo" | "redo"): BlockCommand {
	return {
		kind: "door",
		method: way === "undo" ? "history.undo" : "history.redo",
		args: [],
		reply: (outcome) => {
			if (!outcome.answer.ok) return failed(outcome.answer.error);
			return outcome.answer.result === "conflict" ? { kind: "failed", error: { code: "undoConflict", message: way } } : null;
		},
	};
}

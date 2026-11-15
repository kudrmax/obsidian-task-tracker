import { projectNodeOf, type TaskItem } from "../../../../core/application/contracts";
import { type BlockModel, taskById } from "../model/block";
import type { Command } from "../model/commands";
import { DESCRIPTION_PAUSE_MS, type Description, type DescriptionState, type FullLayer, fullItem, fullLayer, type FullMsg, fullTaskGone, fullTaskOf, fullTree, shownTask } from "../model/full";
import type { Layer } from "../model/layers";
import type { BlockMsg } from "../model/messages";
import type { Step } from "./block";
import { assertNever } from "../model/assertNever";
import { updateEntry } from "./entry";
import { updateMenu } from "./menu";

type Cmd = Command<BlockMsg>;

const SAVE_TIMER = "full:save";

const full = (msg: FullMsg): BlockMsg => ({ kind: "full", msg });
const failed = (error: { readonly code: string; readonly message: string }): BlockMsg => ({ kind: "failed", error });

/** The block with its full card replaced by `next` (null: the card begins to close). */
function withLayer(model: BlockModel, next: FullLayer | null): BlockModel {
	const at = model.layers.findIndex((layer) => layer.kind === "full" && !layer.closing);
	if (at < 0) return model;
	const layer = model.layers.find((_, i) => i === at) as FullLayer;
	const replaced: Layer = next ?? { ...layer, closing: true, description: null };
	return { ...model, layers: model.layers.map((l, i) => (i === at ? replaced : l)) };
}

/** The open full card, one not closing. */
function openFull(model: BlockModel): FullLayer | null {
	const layer = fullLayer(model.layers);
	return layer && !layer.closing ? layer : null;
}

/** A write through the door whose outcome the next view shows. */
function write(method: string, args: readonly unknown[]): Cmd {
	return { kind: "door", method, args, reply: (outcome) => (outcome.answer.ok ? null : failed(outcome.answer.error)) };
}

/**
 * What the editor holds goes to the file once something was typed in it (`description.save`): an editor left untouched
 * sends nothing, so it never writes an old text back over a change made elsewhere.
 */
function save(layer: FullLayer): readonly Cmd[] {
	const description = layer.description;
	const task = shownTask(layer);
	if (!description || !task) return [];
	return [
		{ kind: "cancelTimer", name: SAVE_TIMER },
		{
			kind: "door",
			method: "description.save",
			args: [description.state],
			reply: (outcome) => {
				if (!outcome.answer.ok) return failed(outcome.answer.error);
				const answer = outcome.answer.result as { readonly state: DescriptionState; readonly write: boolean };
				return full({ kind: "saved", state: answer.state, write: answer.write, id: description.id, key: task.key, text: description.text });
			},
		},
	];
}

/** The task on the card is left (another one shown, the card closing): its description is written first, its editor goes. */
function leave(layer: FullLayer): { readonly layer: FullLayer; readonly commands: readonly Cmd[] } {
	return { layer: { ...layer, description: null, focusDescription: false }, commands: save(layer) };
}

function subtaskOf(model: BlockModel, id: string): TaskItem | null {
	const all = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((item) => [item, ...all(item.allSubtasks)]);
	return all(fullTree(model.answers)?.subtasks ?? []).find((item) => item.id === id) ?? null;
}

/**
 * The full card (P2): opened over the block or over itself, its task followed by id, its description written by the
 * core's rules (`description.*`) as it is typed, a pause after the last key.
 */
export function updateFull(model: BlockModel, msg: FullMsg): Step {
	const layer = openFull(model);
	switch (msg.kind) {
		case "open": {
			const item = msg.task ? null : (taskById(model, msg.id) ?? subtaskOf(model, msg.id));
			const task = msg.task ?? (item ? fullTaskOf(item) : null);
			if (!task) return [model, []];
			if (layer) {
				const top = shownTask(layer);
				if (top?.id === task.id) return [withLayer(model, { ...layer, focusDescription: msg.description }), msg.description ? [{ kind: "focus", field: "description" }] : []];
				const left = leave(layer);
				return [withLayer(model, { ...left.layer, id: task.id, stack: [...layer.stack, task], focusDescription: msg.description }), left.commands];
			}
			const opened: FullLayer = { kind: "full", closing: false, id: task.id, stack: [task], description: null, focusDescription: msg.description };
			return [{ ...model, layers: [...model.layers, opened] }, []];
		}
		case "close":
		case "done":
			if (!layer) return [model, []];
			if (msg.kind === "done") return [model, [{ kind: "blur" }, ...save(layer)]];
			return [{ ...withLayer(model, null), pinned: model.pinned }, save(layer)];
		case "up": {
			const item = fullItem(model.answers);
			if (!layer || !item?.parentKey || item.parentText === null) return [model, []];
			const left = leave(layer);
			if (layer.stack.length > 1) {
				const stack = layer.stack.slice(0, -1);
				return [withLayer(model, { ...left.layer, stack, id: stack.slice(-1).find(() => true)?.id ?? layer.id }), left.commands];
			}
			const parent = { id: item.parentKey.id ?? "", key: item.parentKey, text: item.parentText };
			return [withLayer(model, { ...left.layer, stack: [parent], id: parent.id }), left.commands];
		}
		case "project": {
			const project = fullTree(model.answers)?.project;
			if (!layer || !project) return [model, []];
			return [withLayer(model, null), [...save(layer), write("tasks.selectProjectNode", [projectNodeOf(project.name)])]];
		}
		case "subtask":
			return updateMenu(model, { kind: "opened", id: msg.id });
		case "tick": {
			const item = subtaskOf(model, msg.id);
			return item ? [model, [write("tasks.toggleDone", [item.key])]] : [model, []];
		}
		case "more":
			return layer ? updateMenu(model, { kind: "opened", id: layer.id }) : [model, []];
		case "add":
			return layer ? updateEntry(model, { kind: "subtask", id: layer.id }) : [model, []];
		case "drafted": {
			if (!layer || layer.id !== msg.id) return [model, []];
			const description: Description = { id: msg.id, state: msg.state, start: msg.text, text: msg.text, pending: false, focused: false, replace: null };
			const focus: readonly Cmd[] = layer.focusDescription ? [{ kind: "focus", field: "description" }] : [];
			return [withLayer(model, { ...layer, description, focusDescription: false }), focus];
		}
		case "typed": {
			const description = layer?.description;
			if (!layer || !description) return [model, []];
			const typed: Cmd = {
				kind: "door",
				method: "description.typed",
				args: [description.state],
				reply: (outcome) => (outcome.answer.ok ? full({ kind: "read", id: description.id, state: outcome.answer.result as DescriptionState, replace: null }) : failed(outcome.answer.error)),
			};
			return [withLayer(model, { ...layer, description: { ...description, text: msg.text, pending: true } }), [typed, { kind: "timer", name: SAVE_TIMER, ms: DESCRIPTION_PAUSE_MS, msg: full({ kind: "saveDue" }) }]];
		}
		case "editorFocus": {
			const description = layer?.description;
			if (!layer || !description) return [model, []];
			return [withLayer(model, { ...layer, description: { ...description, focused: msg.focused } }), []];
		}
		case "saveDue":
			return layer ? [model, save(layer)] : [model, []];
		case "saved": {
			const description = layer?.description;
			const kept = layer && description && description.id === msg.id ? withLayer(model, { ...layer, description: { ...description, state: msg.state, pending: false } }) : model;
			return [kept, msg.write ? [write("tasks.setDescription", [msg.key, msg.text])] : []];
		}
		case "read": {
			const description = layer?.description;
			if (!layer || !description || description.id !== msg.id) return [model, []];
			const replace = msg.replace === null ? description.replace : { text: msg.replace, seq: (description.replace?.seq ?? 0) + 1 };
			const text = msg.replace ?? description.text;
			return [withLayer(model, { ...layer, description: { ...description, state: msg.state, replace, text } }), []];
		}
		default:
			return assertNever(msg);
	}
}

/**
 * The views changed (P6, data applies at once): the card's task read anew. A task gone gives way to the one under it, or
 * closes the card; its description's editor is opened by the rules, or told a change made elsewhere.
 */
export function followFull(model: BlockModel): Step {
	const layer = openFull(model);
	if (!layer) return [model, []];
	if (fullTaskGone(model.answers)) {
		if (layer.stack.length > 1) {
			const stack = layer.stack.slice(0, -1);
			return [withLayer(model, { ...layer, stack, id: stack.slice(-1).find(() => true)?.id ?? layer.id, description: null }), []];
		}
		return [withLayer(model, null), []];
	}
	const item = fullItem(model.answers);
	if (!item || item.id !== layer.id) return [model, []];
	const top = shownTask(layer);
	const kept = top && (top.key !== item.key || top.text !== item.text) ? withLayer(model, { ...layer, stack: [...layer.stack.slice(0, -1), fullTaskOf(item)] }) : model;
	const description = layer.description;
	if (!description || description.id !== item.id) {
		const opening: Cmd = {
			kind: "door",
			method: "description.open",
			args: [item.description],
			reply: (outcome) => {
				if (!outcome.answer.ok) return failed(outcome.answer.error);
				const opened = outcome.answer.result as { readonly state: DescriptionState; readonly text: string };
				return full({ kind: "drafted", id: item.id, state: opened.state, text: opened.text });
			},
		};
		return [kept, [opening]];
	}
	if (item.description === description.state.file) return [kept, []];
	const reading: Cmd = {
		kind: "door",
		method: "description.read",
		args: [description.state, item.description, { focused: description.focused, pending: description.pending }],
		reply: (outcome) => {
			if (!outcome.answer.ok) return failed(outcome.answer.error);
			const read = outcome.answer.result as { readonly state: DescriptionState; readonly replace: string | null };
			return full({ kind: "read", id: item.id, state: read.state, replace: read.replace });
		},
	};
	return [kept, [reading]];
}

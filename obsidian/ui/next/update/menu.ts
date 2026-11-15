import { repeatDraft, type TaskItem, type TaskMenuModel } from "../../../../core/application/contracts";
import { resultOf } from "../model/answers";
import type { BlockModel } from "../model/block";
import type { Layer } from "../model/layers";
import { menuCards, menuDrawing, menuInput, openMenu } from "../model/menuNeeds";
import type { BlockMsg } from "../model/messages";
import { monthAfter } from "../model/monthGrid";
import { type MenuDrawing, type MenuMsg, pickerMonth, repeatEdited, type TaskMenuLayer } from "../model/taskMenu";
import { assertNever } from "../model/assertNever";
import { type BlockCommand, closeTop, type Step } from "./block";
import { updateEntry } from "./entry";
import { updateFull } from "./full";

const failed = (error: { readonly code: string; readonly message: string }): BlockMsg => ({ kind: "failed", error });
const write = (method: string, args: readonly unknown[]): BlockCommand => ({ kind: "door", method, args, reply: (outcome) => (outcome.answer.ok ? null : failed(outcome.answer.error)) });

/** The open menu changed in place: the layer stands for the next drawing (measured again, keeping `keepAbove` groups over the card). */
function changed(model: BlockModel, layer: TaskMenuLayer, next: Partial<TaskMenuLayer>, keep: boolean): BlockModel {
	const replaced: TaskMenuLayer = { ...layer, ...next, seq: layer.seq + 1, keepAbove: keep ? (layer.place?.above ?? 0) : null };
	return { ...model, layers: model.layers.map((l) => (l === layer ? replaced : l)) };
}

/** What the menu draws now, kept as its close begins. */
const drawing = (model: BlockModel, layer: TaskMenuLayer): MenuDrawing | null => menuDrawing(model, { ...layer, frozen: null });

/**
 * The menu begins to close: what it draws is kept while it fades, and the lists under it are pinned (P6, R10). What the
 * repeat page holds is written now (`repeatPage.end` decides whether it differs from the task's own rule).
 */
export function closeMenu(model: BlockModel): Step {
	const layer = openMenu(model);
	if (!layer) return [closeTop(model), []];
	const frozen = drawing(model, layer);
	const kept: BlockModel = { ...model, layers: model.layers.map((l): Layer => (l === layer ? { ...layer, frozen } : l)) };
	const task = menuCards(model, layer)?.find(() => true)?.item ?? null;
	const held = layer.repeat?.held ?? null;
	const commands: BlockCommand[] =
		task && held && !layer.bulk
			? [{ kind: "door", method: "repeatPage.end", args: [task.repeat, held], reply: (outcome) => (outcome.answer.ok ? { kind: "menu", msg: { kind: "repeatEnd", key: task.key, end: outcome.answer.result as { rule: TaskItem["repeat"] } | null } } : failed(outcome.answer.error)) }]
			: [];
	return [closeTop(kept), commands];
}

/** A pick that writes: the call runs at the tap, the menu closes over the lists as they stood. */
function pickWrite(model: BlockModel, method: string, args: readonly unknown[]): Step {
	const [closed, commands] = closeMenu(model);
	return [closed, [...commands, write(method, args)]];
}

/** The menu follows the file (P6): its task gone, it closes; its content changed, it is drawn again in place. */
export function menuFollows(before: BlockModel, after: BlockModel): Step {
	const layer = openMenu(after);
	if (!layer) return [after, []];
	if (!menuCards(after, layer)) return closeMenu({ ...after, layers: after.layers });
	const was = resultOf<TaskMenuModel>(before.answers, "menu");
	const now = resultOf<TaskMenuModel>(after.answers, "menu");
	return [was !== null && now !== null && was !== now ? changed(after, layer, {}, true) : after, []];
}

function opened(model: BlockModel, layer: TaskMenuLayer): Step {
	return [{ ...model, layers: [...model.layers, layer] }, []];
}

const fresh = (id: string, from: TaskMenuLayer["from"], bulk: TaskMenuLayer["bulk"]): TaskMenuLayer => ({
	kind: "taskMenu",
	closing: false,
	id,
	bulk,
	from,
	page: "menu",
	asking: null,
	month: null,
	repeat: null,
	seq: 0,
	keepAbove: null,
	place: null,
	frozen: null,
});

/**
 * A task's menu and the bulk menu (P6 layers): which call a pick means, which page stands, what is asked. What is
 * offered, on or disabled is the core's (`TaskMenuModel`); a write pick closes the menu as its call runs; a label and a
 * project toggled keep it open, drawn again for the tasks as they then stand.
 */
export function updateMenu(model: BlockModel, msg: MenuMsg): Step {
	if (msg.kind === "opened") {
		const card = menuCards(model, fresh(msg.id, "done", null))?.find(() => true);
		return card ? opened(model, fresh(msg.id, card.from, null)) : [model, []];
	}
	if (msg.kind === "openedBulk") {
		const [first] = model.select?.picked ?? [];
		return first === undefined ? [model, []] : opened(model, fresh(first, "done", msg.at));
	}
	if (msg.kind === "clickedAgain") return openMenu(model)?.id === msg.id && openMenu(model)?.bulk === null ? updateMenu(model, { kind: "edit", id: "rename" }) : [model, []];
	if (msg.kind === "repeatEnd") return [model, msg.end ? [write("tasks.setRepeat", [msg.key, msg.end.rule])] : []];
	if (msg.kind === "openTasksFile") return [model, [{ kind: "openTasksFile", line: msg.line }]];
	const layer = openMenu(model);
	if (!layer) return [model, []];
	if (msg.kind === "placed") {
		if (msg.place.seq !== layer.seq) return [model, []];
		return [{ ...model, layers: model.layers.map((l) => (l === layer ? { ...layer, place: msg.place, keepAbove: null } : l)) }, []];
	}
	const input = menuInput(model, layer);
	if (!input) return [model, []];
	const { tasks, menu } = input;
	const keys = tasks.map((task) => task.key);
	const [task] = tasks;
	const one = layer.bulk === null;
	switch (msg.kind) {
		case "status": {
			const status = menu.statuses.find((s) => s.id === msg.id);
			if (!status) return [model, []];
			if (status.confirm) return [changed(model, layer, { asking: msg.id }, true), []];
			return pickWrite(model, "tasks.pickStatus", [menu.statusTasks.map((t) => t.key), msg.id]);
		}
		case "confirm": {
			const asked = layer.asking;
			if (asked === null) return [model, []];
			if (asked === "delete") return one ? pickWrite(model, "tasks.remove", [task.key]) : pickWrite(model, "tasks.removeAll", [keys]);
			return pickWrite(model, "tasks.pickStatus", [menu.statusTasks.map((t) => t.key), asked]);
		}
		case "cancelAsk":
			return [changed(model, layer, { asking: null }, true), []];
		case "level":
			return pickWrite(model, "tasks.togglePriority", [keys, msg.prefix]);
		case "label":
			return [changed(model, layer, {}, true), [write("tasks.toggleLabel", [keys, msg.name])]];
		case "move":
			return one ? pickWrite(model, "tasks.postpone", [task.key, msg.date]) : pickWrite(model, "tasks.postponeAll", [keys, msg.date]);
		case "removeDue":
			return pickWrite(model, "tasks.removeDue", [keys]);
		case "page": {
			const page = msg.page;
			if (page === "sections" && !menu.sections) return [model, []];
			const repeat = page === "repeat" && one ? (layer.repeat ?? { draft: repeatDraft(task.repeatDay, task.repeat), held: null }) : layer.repeat;
			const month = page === "picker" ? null : layer.month;
			/** A typing pick: the name's field takes the focus inside the tap, so the phone's keyboard rises (P2). */
			return [changed(model, layer, { page, asking: null, repeat, month }, false), page === "projectName" ? [{ kind: "focus", field: "projectName" }] : []];
		}
		case "edit": {
			const [closed, commands] = closeMenu(model);
			const [next, more] =
				msg.id === "description" ? updateFull(closed, { kind: "open", id: task.id, description: true }) : updateEntry(closed, msg.id === "rename" ? { kind: "rename", id: task.id } : { kind: "subtask", id: task.id });
			return [next, [...commands, ...more]];
		}
		case "full": {
			const [closed, commands] = closeMenu(model);
			const [next, more] = updateFull(closed, { kind: "open", id: task.id, description: false });
			return [next, [...commands, ...more]];
		}
		case "section":
			return pickWrite(model, "tasks.toSection", [keys, msg.name]);
		case "newSection": {
			const [closed, commands] = closeMenu(model);
			const [next, more] = updateEntry(closed, { kind: "newSection", id: task.id });
			return [next, [...commands, ...more]];
		}
		case "project":
			if (msg.name === null) return pickWrite(model, "tasks.setProject", [keys, null]);
			return [changed(model, layer, {}, false), [write("tasks.toggleProject", [keys, msg.name])]];
		case "newProject":
			return pickWrite(model, "tasks.newProject", [msg.name, keys]);
		case "reminder":
			return pickWrite(model, "tasks.setReminder", [task.key, msg.kind_]);
		case "repeat":
			return layer.repeat ? [changed(model, layer, { repeat: repeatEdited(layer.repeat, msg.change) }, false), []] : [model, []];
		case "repeatRemove":
			return layer.repeat ? closeMenu(changed(model, layer, { repeat: { ...layer.repeat, held: { rule: null } } }, false)) : [model, []];
		case "month":
			return [changed(model, layer, { month: monthAfter(pickerMonth(layer, input), msg.by) }, false), []];
		case "openFile": {
			const [closed, commands] = closeMenu(model);
			return [closed, [...commands, { kind: "door", method: "tasks.lineOf", args: [task.key], reply: (outcome) => (outcome.answer.ok ? { kind: "menu", msg: { kind: "openTasksFile", line: outcome.answer.result as number } } : failed(outcome.answer.error)) }]];
		}
		case "remove":
			if (menu.remove?.confirm) return [changed(model, layer, { asking: "delete" }, true), []];
			return one ? pickWrite(model, "tasks.remove", [task.key]) : pickWrite(model, "tasks.removeAll", [keys]);
		default:
			return assertNever(msg);
	}
}

const PAGES: ReadonlySet<string> = new Set(["menu", "sections", "projects", "projectName", "reminders", "repeat", "picker"]);
const STATUSES: ReadonlySet<string> = new Set(["done", "inProgress", "stopProgress", "wontDo", "stop"]);
const REMINDERS: ReadonlySet<string> = new Set(["notification", "alarm", "live", "none"]);

/** A name the menu marks a row with (`=name`), or none (`""`: the tasks outside any section, No project). */
const named = (value: string | null): string | null => (value !== null && value.startsWith("=") ? value.slice(1) : null);

/** A tap on the repeat page (`kind:schedule`, `unit:week`, `every:-1`, `weekday:3`) as `editRepeat` takes it. */
function repeatChange(value: string | null): MenuMsg | null {
	const [what, to] = (value ?? "").split(":");
	if (what === "kind" && (to === "schedule" || to === "afterDone")) return { kind: "repeat", change: { what, to } };
	if (what === "unit" && (to === "day" || to === "week" || to === "month")) return { kind: "repeat", change: { what, to } };
	if (what === "every" && (to === "1" || to === "-1")) return { kind: "repeat", change: { what, by: to === "1" ? 1 : -1 } };
	if (what === "weekday") return { kind: "repeat", change: { what, day: Number(to) as never } };
	return null;
}

/** What a press on the menu's panel means (`menu:…` acts, the value they carry); null for nothing. */
export function menuActMessage(name: string, value: string | null): MenuMsg | null {
	switch (name) {
		case "status":
			return value !== null && STATUSES.has(value) ? { kind: "status", id: value as never } : null;
		case "confirm":
			return { kind: "confirm" };
		case "cancelAsk":
			return { kind: "cancelAsk" };
		case "level":
			return value === null ? null : { kind: "level", prefix: value };
		case "label":
			return value === null ? null : { kind: "label", name: value };
		case "move":
			return value === null ? null : { kind: "move", date: value };
		case "page":
			return value !== null && PAGES.has(value) ? { kind: "page", page: value as never } : null;
		case "edit":
			return value === "rename" || value === "description" || value === "subtask" ? { kind: "edit", id: value } : null;
		case "section":
			return { kind: "section", name: named(value) };
		case "newSection":
			return { kind: "newSection" };
		case "project":
			return { kind: "project", name: named(value) };
		case "newProject": {
			const name = (value ?? "").trim();
			return name === "" ? { kind: "page", page: "projects" } : { kind: "newProject", name };
		}
		case "reminder":
			return value !== null && REMINDERS.has(value) ? { kind: "reminder", kind_: value as never } : null;
		case "repeat":
			return repeatChange(value);
		case "repeatRemove":
			return { kind: "repeatRemove" };
		case "month":
			return value === "1" || value === "-1" ? { kind: "month", by: value === "1" ? 1 : -1 } : null;
		case "removeDue":
			return { kind: "removeDue" };
		case "full":
			return { kind: "full" };
		case "openFile":
			return { kind: "openFile" };
		case "remove":
			return { kind: "remove" };
		default:
			return null;
	}
}

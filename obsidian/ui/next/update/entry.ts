import { type EntryJobOutcome, entryJobStep, type EntryJobs, type EntryList, type EntryState, queuedEntryJobs, type TaskItem } from "../../../../core/application/contracts";
import { type BlockModel, shownLists, taskById } from "../model/block";
import type { Command } from "../model/commands";
import { type EntryModel, type EntryMsg, entryModel, type EntryThen } from "../model/entry";
import { entryLists } from "../model/entry";
import type { BlockMsg } from "../model/messages";
import { assertNever } from "../model/assertNever";
import type { Step } from "./block";

/** What an `entry.*` call answers (`EntryAnswer`), as far as the block reads it. */
interface EntryAnswer {
	readonly session: unknown;
	readonly state: EntryState | null;
	readonly jobs: EntryJobs["queue"];
	readonly value: unknown;
	readonly renamed: EntryState["renamed"];
}


/** The entry as the block holds it: a fresh one before the first field. */
export function entryOf(model: BlockModel): EntryModel {
	return model.entry ?? entryModel();
}

function withEntry(model: BlockModel, entry: EntryModel): BlockModel {
	return { ...model, entry };
}

/** An `entry.*` call: the host hands the core the session and the look as they stand, then the arguments (P3). */
function entryCall(method: string, args: readonly unknown[], then: EntryThen = null): Command<BlockMsg> {
	return { kind: "entryCall", method, args, reply: (answer) => ({ kind: "entry", msg: { kind: "answered", answer, job: false, then } }) };
}

/** A field opened by a typing pick takes the focus inside the tap that opened it (P2, Picks 2). */
function opening(model: BlockModel, method: string, args: readonly unknown[], then: EntryThen = null): Step {
	const entry = entryOf(model);
	return [withEntry(model, { ...entry, focus: entry.focus + 1 }), [entryCall(method, args, then)]];
}

/** The list a row of the block is drawn in, by the entry's name for it. */
function columnOf(model: BlockModel, row: string): EntryList | null {
	for (const [column, list] of entryLists(shownLists(model))) if (list.rows.some((r) => r.key === row)) return column;
	return null;
}

/** The task a menu names, as the block shows it now (its pin holds the id, P6). */
function itemOf(model: BlockModel, id: string): TaskItem | null {
	return taskById(model, id);
}

/**
 * The quick entry (quick-add spec §4.2–4.9): every message is a call of the core's `QuickEntry` behind the door, the
 * model keeping what it answers. The jobs the answers queue run in the core's order (`entryJobStep`), one step at a
 * time (`runEntryJobs`).
 */
export function updateEntry(model: BlockModel, msg: EntryMsg): Step {
	const entry = entryOf(model);
	switch (msg.kind) {
		case "plus":
			return opening(model, "entry.openFromPlus", []);
		case "inSection": {
			const column = columnOf(model, msg.row);
			if (!column) return [model, []];
			return msg.list ? opening(model, "entry.openAtEnd", [column]) : opening(model, "entry.openIn", [column, msg.group]);
		}
		case "atEnd":
			return opening(model, "entry.openAtEnd", [msg.column]);
		case "atDrop":
			return opening(model, "entry.openAtDrop", [msg.column, msg.drop]);
		case "atPlace":
			return opening(model, "entry.openAt", [msg.column, msg.place]);
		case "rename": {
			const item = itemOf(model, msg.id);
			return item ? opening(model, "entry.renameSpot", [item, false], { open: "rename", item }) : [model, []];
		}
		case "subtask": {
			const item = itemOf(model, msg.id);
			return item ? opening(model, "entry.subtaskSpot", [item.key], { open: "subtask", item }) : [model, []];
		}
		case "newSection": {
			const item = itemOf(model, msg.id);
			return item ? opening(model, "entry.renameSpot", [item, false], { open: "newSection", item }) : [model, []];
		}
		case "typed":
			if (!entry.state || entry.state.text === msg.text) return [model, []];
			return [model, [entryCall("entry.type", [msg.text])]];
		case "key":
			if (!entry.state) return [model, []];
			switch (msg.key) {
				case "enter":
					return [model, [entryCall("entry.enter", [], { enter: true })]];
				case "escape":
					return [model, [entryCall("entry.escape", [])]];
				case "tab":
					return [model, [entryCall("entry.indent", [1])]];
				case "shiftTab":
					return [model, [entryCall("entry.indent", [-1])]];
				case "altTab":
					return [model, [entryCall("entry.toggleSection", [])]];
				default:
					return assertNever(msg.key);
			}
		case "blurred":
			return entry.state ? [model, [entryCall("entry.blur", [])]] : [model, []];
		case "bar":
			return bar(model, entry, msg.act, msg.value);
		case "answered":
			return answered(model, entry, msg.answer, msg.then);
		case "stepped":
			return stepped(model, entry, msg.outcome, msg.method, msg.error);
		default:
			return assertNever(msg);
	}
}

/** The bar's buttons: each one call of the core's (the levels' and labels' tiles toggle, a place moves the field). */
function bar(model: BlockModel, entry: EntryModel, act: string, value: string | null): Step {
	if (!entry.state) return [model, []];
	switch (act) {
		case "outdent":
			return [model, [entryCall("entry.indent", [-1])]];
		case "indent":
			return [model, [entryCall("entry.indent", [1])]];
		case "section":
			return [model, [entryCall("entry.toggleSection", [])]];
		case "priority":
			return value === null ? [model, []] : [withEntry(model, { ...entry, panel: null }), [entryCall("entry.togglePriority", [value])]];
		case "label":
			return value === null ? [model, []] : [model, [entryCall("entry.toggleLabel", [value])]];
		case "place":
			return value === null ? [model, []] : [withEntry(model, { ...entry, panel: null }), [entryCall("entry.choosePlace", [JSON.parse(value) as unknown])]];
		case "panel":
			return [withEntry(model, { ...entry, panel: entry.panel === value ? null : value }), []];
		default:
			return [model, []];
	}
}


/** An `entry.*` answer taken: its session, the field's state, the renames waiting, the jobs it queued; then what follows it. */
function answered(model: BlockModel, entry: EntryModel, answer: unknown, then: EntryThen): Step {
	const ok = okAnswer(answer);
	if (!ok) return [model, failure(answer)];
	const created = then !== null && "enter" in then && ok.jobs.some((job) => job.kind === "create");
	const next: EntryModel = {
		...entry,
		session: ok.session,
		state: ok.state,
		renamed: ok.renamed,
		queued: [...entry.queued, ...ok.jobs],
		panel: ok.state ? entry.panel : null,
		/** A line entered: its card takes the field's row, and the field that opens under it is a row of its own. */
		...(created && { heirs: [...entry.heirs, entry.field], field: `entry:${entry.fields + 1}`, fields: entry.fields + 1 }),
	};
	const opened = withEntry(model, next);
	if (then === null || "enter" in then) return [opened, []];
	if ("after" in then) return [opened, [entryCall(then.after, [])]];
	const spot = ok.value;
	if (spot === null || spot === undefined) return [opened, []];
	if (then.open === "rename") return [opened, [entryCall("entry.open", [spot, then.item])]];
	/** A section's name is typed where the task stands: the field opens there, then switches to a section's name. */
	if (then.open === "newSection") return [opened, [entryCall("entry.open", [spot], { after: "entry.toggleSection" })]];
	return [opened, [entryCall("entry.open", [spot])]];
}

/**
 * A job step came to `outcome`: the next step is due. A write that made a task answers its id (`CreatedTask`): its card
 * takes the row of the line it was typed as (R4), so it stands where the text stood.
 */
function stepped(model: BlockModel, entry: EntryModel, outcome: EntryJobOutcome, method: string, error: { readonly code: string; readonly message: string } | null): Step {
	const answer = outcome?.ok && method.startsWith("entry.") ? okResult(outcome.result) : null;
	const id = outcome?.ok && method === "tasks.createWithId" ? createdId(outcome.result) : null;
	const [heir, ...heirs] = entry.heirs;
	const bound = id !== null && heir !== undefined ? new Map([...entry.bound, [id, heir] as const].slice(-8)) : entry.bound;
	const next: EntryModel = {
		...entry,
		...(answer && { session: answer.session, state: answer.state, renamed: answer.renamed }),
		...(id !== null && heir !== undefined && { heirs }),
		bound,
		due: { outcome },
	};
	return [withEntry(model, next), error ? [{ kind: "failure", error }] : []];
}

function okAnswer(answer: unknown): EntryAnswer | null {
	const outcome = answer as { readonly ok?: boolean; readonly result?: unknown };
	return outcome.ok ? okResult(outcome.result) : null;
}

function okResult(result: unknown): EntryAnswer | null {
	return typeof result === "object" && result !== null && "session" in result ? (result as EntryAnswer) : null;
}

function createdId(result: unknown): string | null {
	return typeof result === "object" && result !== null && "id" in result && typeof result.id === "string" ? result.id : null;
}

function failure(answer: unknown): readonly Command<BlockMsg>[] {
	const error = (answer as { readonly error?: { readonly code: string; readonly message: string } }).error;
	return error ? [{ kind: "failure", error }] : [];
}

/** A job step's door call: its outcome comes back as `stepped`; an `entry.*` step takes the session and the look first. */
function jobCall(method: string, args: readonly unknown[], coming: boolean): Command<BlockMsg> {
	const reply = (answer: unknown): BlockMsg => {
		const outcome = answer as { readonly ok: boolean; readonly result?: unknown; readonly error?: { readonly code: string; readonly message: string } };
		return { kind: "entry", msg: { kind: "stepped", outcome: outcome.ok ? { ok: true, result: outcome.result } : { ok: false }, method, error: outcome.ok ? null : (outcome.error ?? null) } };
	};
	return method.startsWith("entry.") ? { kind: "entryCall", method, args, coming, reply } : { kind: "door", method, args, reply: (o) => reply(o.answer) };
}

/**
 * The quick entry's jobs run in the core's order (`entryJobStep`), one door call a message: the jobs an answer queued
 * join the queue; the step due (the next one after an outcome, or the first of a queue with none running) is asked for
 * and its outcome comes back as `stepped`. A step that only tells (`renamed`) is passed.
 */
export function runEntryJobs(model: BlockModel): Step {
	const entry = model.entry;
	if (!entry || (entry.due === null && entry.queued.length === 0)) return [model, []];
	let jobs = queuedEntryJobs(entry.jobs, entry.queued);
	let outcome: EntryJobOutcome = entry.due?.outcome ?? null;
	const settled = (commands: readonly Command<BlockMsg>[]): Step => [withEntry(model, { ...entry, jobs, queued: [], due: null }), commands];
	if (entry.due === null && jobs.running !== null) return settled([]);
	for (;;) {
		const next = entryJobStep(jobs, outcome);
		jobs = next.jobs;
		const step = next.step;
		if (step === null) return settled([]);
		if (step.kind === "door") return settled([jobCall(step.method, step.args, step.coming === true)]);
		outcome = null;
	}
}

import type { App } from "obsidian";
import { render } from "preact";
import { type Cmd, type EntryJobOutcome, type EntryJobs, entryJobStep, type HostSession, type Program, queuedEntryJobs, type RuntimeEvent, type Store, type Views } from "../../../../runtime/Runtime";
import type { Answers, Need } from "../../model/answers";
import { Chrome } from "../../drivers/chrome";
import { Focus } from "../../drivers/focus";
import { Input } from "../../drivers/input";
import { type BlockKey, Keys } from "../../drivers/keys";
import { Measure } from "../../drivers/measure";
import { Motion } from "../../drivers/motion";
import { OverlayHost } from "../../drivers/overlay";
import { type BlockModel, blockModel, blockNeeds, currentLists, rowVars, sectioned } from "../../model/block";
import type { Command } from "../../model/commands";
import type { Act, BlockMsg } from "../../model/messages";
import { updateBlock } from "../../update/block";
import { BlockRoot } from "../../view/BlockRoot";
import { type FieldFactory, type FieldKeys, type Hotkey, Islands } from "../../drivers/islands";
import { drawnLists, type EntryLook, entryLook } from "../../model/entry";

/** What a block's host is told by the plugin: Obsidian's app as far as a block uses it, and the plugin's words for a failure. */
export interface BlockDeps {
	readonly session: HostSession;
	readonly app: Pick<App, "keymap" | "scope">;
	/** The words Max reads when a door call failed (`failureText` of the plugin). */
	readonly failure: (error: { readonly code: string; readonly message: string }) => string;
	/** Says a short message: Obsidian's `Notice`. */
	readonly notice: (text: string) => void;
	/** A link of a title: a note in a new tab, an address in the browser. */
	readonly openLink: (link: { readonly kind: "note" | "url"; readonly target: string }) => void;
	/** The title field a task is typed in (Obsidian's editor, `obsidianTitleField`), its own keys made by the block's. */
	readonly titleField: (keys: (onSwitch: () => void, lines: readonly Hotkey[]) => FieldKeys) => FieldFactory;
}

// The quick entry's calls and jobs ----------------------------------------------------------------------------------

/** What the entry's calls read of the runtime: the block's view answers as the replica stands now (P2, memoised). */
type FreshViews = (needs: readonly Need[]) => Answers;

/** The block as the replica stands now: its answers read again, twice, since what it needs follows what it has. */
function fresh(model: BlockModel, views: FreshViews): BlockModel {
	const once = { ...model, answers: views(blockNeeds(model)) };
	return { ...once, answers: views(blockNeeds(once)) };
}

/** The look of the block the core's entry reads (`WireLook`): what the lists draw from the replica now, so a write before it is in it. */
function lookOf(model: BlockModel, views: FreshViews): EntryLook | null {
	const now = fresh(model, views);
	return entryLook(now, currentLists(now), (column) => sectioned(now, column));
}

/** An `entry.*` call as the door takes it: the session the model holds and the look as it stands, then the call's own arguments. */
function entryDoor(model: BlockModel, command: Extract<Command<BlockMsg>, { kind: "entryCall" }>, views: FreshViews): Cmd<BlockMsg> {
	const look = lookOf(model, views);
	return { kind: "door", method: command.method, args: [model.entry?.session ?? null, look, ...command.args], reply: (outcome) => command.reply(outcome.answer) };
}

/**
 * The quick entry's jobs run in the core's order (`entryJobStep`), one door call a message: the jobs an answer queued
 * join the queue; the step due (the next one after an outcome, or the first of a queue with none running) is asked for
 * and its outcome comes back as `stepped`. A step that only tells (`renamed`) is passed. Answers the model with the jobs
 * as they now stand and the call to make, if any.
 */
function stepJobs(model: BlockModel, views: FreshViews): readonly [BlockModel, readonly Cmd<BlockMsg>[]] {
	const entry = model.entry;
	if (!entry || (entry.due === null && entry.queued.length === 0)) return [model, []];
	let jobs = queuedEntryJobs(entry.jobs as EntryJobs, entry.queued as EntryJobs["queue"]);
	const settled = (cmds: readonly Cmd<BlockMsg>[]): readonly [BlockModel, readonly Cmd<BlockMsg>[]] => [{ ...model, entry: { ...entry, jobs, queued: [], due: null } }, cmds];
	if (entry.due === null && jobs.running !== null) return settled([]);
	let outcome: EntryJobOutcome = entry.due?.outcome ?? null;
	for (;;) {
		const next = entryJobStep(jobs, outcome);
		jobs = next.jobs;
		const step = next.step;
		if (step === null) return settled([]);
		if (step.kind === "renamed") {
			outcome = null;
			continue;
		}
		const method = step.method;
		const entryCall = method.startsWith("entry.");
		const look = entryCall ? lookOf({ ...model, entry: { ...entry, jobs } }, views) : null;
		const args = entryCall ? [entry.session, look, ...step.args, ...(step.coming && look ? [look.cards] : [])] : step.args;
		const reply = (answer: { readonly ok: boolean; readonly result?: unknown; readonly error?: { readonly code: string; readonly message: string } }): BlockMsg => ({
			kind: "entry",
			msg: { kind: "stepped", outcome: answer.ok ? { ok: true, result: answer.result } : { ok: false }, method, error: answer.ok ? null : (answer.error ?? null) },
		});
		return settled([{ kind: "door", method, args, reply: (o) => reply(o.answer) }]);
	}
}

// The program --------------------------------------------------------------------------------------------------------

/** The block's program for the runtime's store (P2): the model's update, its needs, the runtime's events as messages. */
function blockProgram(effects: (command: Command<BlockMsg>, dispatch: (msg: BlockMsg) => void) => void, views: FreshViews): Program<BlockModel, BlockMsg> {
	return {
		update: (model, msg) => {
			const [next, commands] = updateBlock(model, msg);
			const cmdOf = (command: Command<BlockMsg>): Cmd<BlockMsg> => {
				if (command.kind === "door") return { kind: "door", method: command.method, args: command.args, reply: (outcome) => command.reply(outcome) };
				if (command.kind === "entryCall") return entryDoor(next, command, views);
				return { kind: "effect", run: (dispatch) => effects(command, dispatch) };
			};
			const [stepped, jobs] = stepJobs(next, views);
			return [stepped, [...commands.map(cmdOf), ...jobs]];
		},
		needs: blockNeeds,
		viewsChanged: (views: Views): BlockMsg => ({ kind: "views", answers: views }),
		fromRuntime: (event: RuntimeEvent): BlockMsg | null => (event.kind === "rebased" ? { kind: "rebased", idMap: event.idMap } : null),
	};
}

/**
 * A note's block as a host (P8): it mounts the view in its own node where it is placed, owns every driver, observer,
 * scope and timer it starts, and ends them all, and its carry, when it goes. Its store runs on its session, so its
 * teardown touches nothing of another host's.
 */
export class BlockHost {
	/** The node the block stands in: the host places it at the note's end. */
	readonly node: HTMLElement;
	private readonly store: Store<BlockModel, BlockMsg>;
	private readonly overlay: OverlayHost;
	private readonly motion: Motion;
	private readonly input = new Input();
	readonly measure = new Measure();
	private keys: Keys | null = null;
	private readonly islands: Islands;
	/** The typing pick the field last took the focus for. */
	private focusedFor = 0;
	private drawnSeq = -1;
	private frame: HTMLElement | null = null;
	private disposed = false;

	constructor(
		private readonly deps: BlockDeps,
		note: string,
		doc: Document,
	) {
		this.node = doc.createElement("div");
		this.overlay = new OverlayHost(doc);
		this.motion = new Motion(this.node);
		this.islands = new Islands(deps.titleField((onSwitch, lines) => this.keys?.field(onSwitch, lines) ?? { hold: () => undefined, dispose: () => undefined }));
		const views: FreshViews = (needs) => deps.session.views(needs);
		this.store = deps.session.store(blockProgram((command, dispatch) => this.run(command, dispatch), views), blockModel(note, Chrome.wide()), { render: (model) => this.draw(model) });
	}

	/** The block is on the page: drawn at once, its presses and keys its own. */
	mount(): void {
		const acted = (act: Act) => this.dispatch({ kind: "acted", act });
		this.input.acts(this.node, acted);
		this.input.acts(this.overlay.node, acted);
		this.store.flush();
		this.input.escape(
			this.node.ownerDocument,
			() => this.store.model.layers.some((layer) => !layer.closing),
			() => this.dispatch({ kind: "layerDismissed" }),
		);
	}

	get model(): BlockModel {
		return this.store.model;
	}

	dispatch = (msg: BlockMsg): void => {
		if (!this.disposed) this.store.dispatch(msg);
	};

	private draw(model: BlockModel): void {
		if (this.disposed) return;
		const moved = model.motion.seq !== this.drawnSeq;
		this.motion.before();
		render(<BlockRoot model={model} layers={this.overlay.node} />, this.node);
		this.drawnSeq = model.motion.seq;
		this.motion.after(moved ? model.motion.cause : "none", rowVars(drawnLists(model)), model.entry?.bound);
		this.motion.layers(this.overlay.node, this.node, () => this.dispatch({ kind: "layerGone" }));
		this.attach();
		this.placeField(model);
		if (this.frame) this.motion.besideField(this.frame);
	}

	/**
	 * The field the entry types in, an island the view only gives a place: it takes the text the core answers, the focus
	 * once for each typing pick (inside the tap), and tells what is typed and pressed.
	 */
	private placeField(model: BlockModel): void {
		const entry = model.entry;
		const state = entry?.state ?? null;
		const focus = entry !== null && entry.focus > this.focusedFor;
		if (focus && entry) this.focusedFor = entry.focus;
		this.islands.place(this.node, state ? { text: state.text, placeholder: state.section ? "Section name" : "New task", focus } : null, {
			typed: (text) => this.dispatch({ kind: "entry", msg: { kind: "typed", text } }),
			key: (key) => this.dispatch({ kind: "entry", msg: { kind: "key", key } }),
			blurred: () => this.dispatch({ kind: "entry", msg: { kind: "blurred" } }),
		});
	}

	/** The block's frame, drawn once: its presses stop at it, a press focuses it, its keys stand over Obsidian's while it holds the focus. */
	private attach(): void {
		const frame = this.node.firstElementChild;
		if (!(frame instanceof HTMLElement) || frame === this.frame) return;
		this.frame = frame;
		this.input.shield(frame, () => Focus.take(frame));
		this.keys = new Keys(this.deps.app as App, frame, (key) => this.key(key, frame));
	}

	/** Cmd+Z and Cmd+Shift+Z in the block; in a field they stay the field's, taking typing back. */
	private key(key: BlockKey, frame: HTMLElement): boolean {
		if (key !== "find" && Focus.inField(frame.ownerDocument)) return true;
		this.dispatch({ kind: "key", key });
		return false;
	}

	/** An effect a message asked for, run after the render through the drivers. */
	private run(command: Command<BlockMsg>, dispatch: (msg: BlockMsg) => void): void {
		if (this.disposed) return;
		switch (command.kind) {
			case "door":
				return;
			case "openLink":
				return this.deps.openLink(command.link);
			case "notice":
				return this.deps.notice(command.text);
			case "failure":
				return this.deps.notice(this.deps.failure(command.error));
			case "haptic":
				return;
			case "focus":
				Focus.field(this.node.ownerDocument, command.field);
				return;
			case "timer":
				return this.input.timer(this.node, command.name, command.ms, () => dispatch(command.msg));
			case "cancelTimer":
				return this.input.cancelTimer(command.name);
			case "noteSearch":
			case "entryCall":
				return;
		}
	}

	/** The block goes (its note closed, no project's any more, the plugin unloading): everything it started ends. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.deps.session.teardown();
		this.motion.dispose();
		this.measure.dispose();
		this.input.dispose();
		this.islands.dispose();
		this.keys?.dispose();
		render(null, this.node);
		this.overlay.dispose();
		this.node.remove();
	}
}

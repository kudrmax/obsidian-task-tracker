import type { App } from "obsidian";
import { render } from "preact";
import { type Cmd, type EntryJobOutcome, type EntryJobs, entryJobStep, type HostSession, type Program, queuedEntryJobs, type RuntimeEvent, type Store, type Views } from "../../../../runtime/Runtime";
import type { Answers, Need } from "../../model/answers";
import { Chrome } from "../../drivers/chrome";
import { Focus } from "../../drivers/focus";
import { Input, PRESSED } from "../../drivers/input";
import { type EditorFactory, Editors, MountNode } from "../../drivers/islands";
import { Measure as MeasureOf } from "../../drivers/measure";
import { Scroll } from "../../drivers/scroll";
import { descriptionIsland } from "../../model/full";
import { fullRowVars } from "../../model/fullList";
import { searchFieldKey, SEARCH_FIELD } from "../../update/search";
import { type BlockKey, Keys } from "../../drivers/keys";
import { Measure } from "../../drivers/measure";
import { Motion } from "../../drivers/motion";
import { OverlayHost } from "../../drivers/overlay";
import { EdgeScroll } from "../../drivers/scroll";
import { type BlockModel, blockModel, blockNeeds, holdsHeight, currentLists, projectsView, rootVars, rowVars, sectioned, settings } from "../../model/block";
import type { CarryMsg, CarryTarget } from "../../model/carry";
import { targetAt } from "../../model/carryPlace";
import { carryVars } from "../../model/carryView";
import { type Gesture, IDLE, press, type PressInput, type PressState } from "../../recognizers/press";
import type { Command } from "../../model/commands";
import type { Act, BlockMsg } from "../../model/messages";
import { updateBlock } from "../../update/block";
import { menuVars, openMenu } from "../../model/menuNeeds";
import { BlockRoot } from "../../view/BlockRoot";
import { type FieldFactory, type FieldKeys, type Hotkey, Islands } from "../../drivers/islands";
import { drawnLists, type EntryLook, entryLook } from "../../model/entry";

/** How long a finger holds a card still before it lifts, ms, while the settings are not read yet (the settings' default). */
const LONG_PRESS_MS = 250;

/** Two targets are the same place: the same gap of the same list, the same drop and plate (the host tells only a change). */
function sameTarget(a: CarryTarget | null, b: CarryTarget | null): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

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
	/** The tasks file in Obsidian's editor, in a new tab, the cursor at the start of `line` (a menu's Open in Obsidian). */
	readonly openTasksFile: (line: number) => void;
	/** The title field a task is typed in (Obsidian's editor, `obsidianTitleField`), its own keys made by the block's. */
	readonly titleField: (keys: (onSwitch: () => void, lines: readonly Hotkey[]) => FieldKeys) => FieldFactory;
	/** Obsidian's own editor for the full card's description; none (a test): no editor stands there. */
	readonly editors?: EditorFactory;
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
	readonly mountNode: MountNode;
	private readonly store: Store<BlockModel, BlockMsg>;
	private readonly overlay: OverlayHost;
	private readonly motion: Motion;
	private readonly input = new Input();
	readonly measure = new Measure();
	private keys: Keys | null = null;
	private readonly islands: Islands;
	/** The full card's description editor. */
	private readonly editors: Editors;
	/** The typing pick the field last took the focus for. */
	private focusedFor = 0;
	private drawnSeq = -1;
	/** The press under way, as the recognizer reads it (`recognizers/press.ts`). */
	private pressed: PressState = IDLE;
	/** The finger of the carry under way, last seen (client pixels): a scroll of the stack reads the target there again. */
	private finger: { readonly x: number; readonly y: number } | null = null;
	private edge: EdgeScroll | null = null;
	/** A field a typing pick asked to focus that could not take it yet (still hidden for measuring). */
	private focusing: string | null = null;
	private frame: HTMLElement | null = null;
	private disposed = false;

	constructor(
		private readonly deps: BlockDeps,
		note: string,
		/** An element of the window the block stands in: its node is made there. */
		near: HTMLElement,
	) {
		this.mountNode = new MountNode(near);
		this.node = this.mountNode.node;
		this.overlay = new OverlayHost(near);
		this.motion = new Motion(this.node);
		this.islands = new Islands(deps.titleField((onSwitch, lines) => this.keys?.field(onSwitch, lines) ?? { hold: () => undefined, dispose: () => undefined }));
		const views: FreshViews = (needs) => deps.session.views(needs);
		this.store = deps.session.store(blockProgram((command, dispatch) => this.run(command, dispatch), views), blockModel(note, Chrome.wide()), { render: (model) => this.draw(model) });
		this.editors = new Editors(deps.editors ?? null);
	}

	/** The block is on the page: drawn at once, its presses and keys its own. */
	mount(): void {
		const acted = (act: Act) => this.dispatch({ kind: "acted", act });
		this.input.acts(this.node, acted, PRESSED);
		this.input.acts(this.overlay.node, acted);
		this.input.presses(this.node, (raw) => this.feed(raw), () => this.store.model.carry !== null);
		this.input.escape(
			this.node,
			() => this.store.model.carry?.phase === "carried" || (this.store.model.select !== null && this.store.model.layers.length === 0),
			() => this.dispatch(this.store.model.carry ? { kind: "carry", msg: { kind: "cancel" } } : { kind: "select", msg: { kind: "stop" } }),
		);
		for (const root of [this.node, this.overlay.node]) this.input.typing(root, (field, value) => this.typed(field, value), (field, key) => this.fieldKey(field, key));
		this.store.flush();
		this.input.fields(this.overlay.node, acted);
		this.input.enter(
			this.node,
			() => openMenu(this.store.model)?.asking != null,
			() => this.dispatch({ kind: "menu", msg: { kind: "confirm" } }),
		);
		this.input.escape(
			this.node,
			() => (this.store.model.layers.some((layer) => !layer.closing) || (this.store.model.search?.closing === false)) && !Focus.inField(this.node),
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
		this.motion.before(moved && model.motion.cause === "move");
		/** A hold starts at the height the frame has before this drawing (a field's row must not grow it first). */
		const drawn = this.node.firstElementChild;
		if (drawn instanceof HTMLElement && holdsHeight(model)) Motion.holdHeight(drawn, true);
		render(<BlockRoot model={model} layers={this.overlay.node} />, this.node);
		this.drawnSeq = model.motion.seq;
		this.motion.after(moved ? model.motion.cause : "none", new Map([...rowVars(drawnLists(model)), ...carryVars(model), ...fullRowVars(model), ...rootVars(model)]), model.entry?.bound);
		const frame = this.node.firstElementChild;
		if (frame instanceof HTMLElement) Motion.holdHeight(frame, holdsHeight(model));
		this.motion.layerVars(this.overlay.node, menuVars(model));
		const menu = openMenu(model);
		this.motion.menu(this.overlay.node, this.node, menu?.place ?? null, (place) => this.dispatch({ kind: "menu", msg: { kind: "placed", place } }));
		const gone = (layer: number) => this.dispatch(layer < 0 ? { kind: "search", msg: { kind: "gone" } } : { kind: "layerGone" });
		this.motion.layers(this.overlay.node, this.node, gone);
		this.motion.layers(this.node, this.node, gone);
		const island = descriptionIsland(model.layers);
		this.editors.sync(this.node, island ? [{ name: "description", ...island, hooks: this.descriptionHooks }] : []);
		this.attach();
		this.placeField(model);
		if (this.frame) this.motion.besideField(this.frame);
		this.focusNow();
	}

	/**
	 * The field a typing pick asked for takes the focus as soon as it can: a menu's page measured before it shows draws
	 * once more in the same pass, still inside the user's event (P2).
	 */
	private focusNow(): void {
		if (this.focusing !== null && Focus.field(this.node, this.focusing)) this.focusing = null;
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
		this.input.shield(frame, () => {
			Focus.take(frame);
			if (this.store.model.found) this.dispatch({ kind: "search", msg: { kind: "pressed" } });
		});
		this.keys = new Keys(this.deps.app as App, frame, (key) => this.key(key, frame));
	}

	private carry(msg: CarryMsg): void {
		this.dispatch({ kind: "carry", msg });
	}

	/** An event of the pointer's stream, read by the press recognizer; the long press's wait armed or dropped as it says. */
	private feed(raw: PressInput): void {
		const { state, gesture, armTimer } = press(this.pressed, raw);
		this.pressed = state;
		if (armTimer) this.input.timer(this.node, "press", settings(this.store.model)?.longPressMs ?? LONG_PRESS_MS, () => this.feed({ kind: "held" }));
		else this.input.cancelTimer("press");
		if (gesture) this.gesture(gesture);
	}

	private stack(): HTMLElement | null {
		return Measure.stack(this.node);
	}

	/** A gesture the recognizer read: a tap or a right click is the card's; a lift, a move and a drop are the carry's. */
	private gesture(gesture: Gesture): void {
		switch (gesture.kind) {
			case "tap":
				if (gesture.target.key !== null) this.carry({ kind: "tap", key: gesture.target.key, act: gesture.target.act, mod: gesture.mod, shift: gesture.shift });
				return;
			case "menu":
				if (gesture.target.key !== null) this.carry({ kind: "context", key: gesture.target.key });
				return;
			case "lift": {
				const key = gesture.target.key;
				const box = key === null ? null : Measure.row(this.node, key);
				if (key === null || !box) return;
				this.carry({ kind: "lift", key, at: gesture.at, box });
				const carry = this.store.model.carry;
				if (!carry) return;
				const stack = this.stack();
				this.edge = stack ? new EdgeScroll(stack, () => Measure.scrollEdges(stack), () => this.over()) : null;
				this.motion.floatAt(this.overlay.node, gesture.at.x, gesture.at.y, carry.grab);
				this.finger = gesture.at;
				this.over();
				return;
			}
			case "carry": {
				const carry = this.store.model.carry;
				if (!carry || carry.phase !== "carried") return;
				this.finger = gesture.at;
				this.motion.floatAt(this.overlay.node, gesture.at.x, gesture.at.y, carry.grab);
				this.edge?.follow(gesture.at.y);
				this.over();
				return;
			}
			case "drop":
				this.endFinger();
				return this.carry({ kind: "drop" });
			case "lost":
				this.endFinger();
				return this.carry({ kind: "cancel" });
		}
	}

	private endFinger(): void {
		this.finger = null;
		this.edge?.stop();
		this.edge = null;
	}

	/** The target under the finger read again (the core's rules over the geometry at the lift); told only when it changed (P5). */
	private over(): void {
		const model = this.store.model;
		const carry = model.carry;
		const stack = this.stack();
		if (!carry || carry.phase !== "carried" || !this.finger || !stack || !model.pinned) return;
		const at = Measure.inStack(stack, this.finger.x, this.finger.y);
		const target = targetAt(carry, model.pinned, projectsView(model), at.x, at.y);
		if (!sameTarget(target, carry.target)) this.carry({ kind: "over", target });
	}

	/** The description's editor tells what was typed, its focus, Escape (the keyboard goes, what was typed is written). */
	private readonly descriptionHooks = {
		change: (text: string) => this.dispatch({ kind: "full", msg: { kind: "typed", text } }),
		focus: (focused: boolean) => this.dispatch({ kind: "full", msg: { kind: "editorFocus", focused } }),
		escape: () => this.dispatch({ kind: "full", msg: { kind: "done" } }),
	};

	/** A field of the view typed in: the search's query. */
	private typed(field: string, value: string): void {
		if (field === SEARCH_FIELD) this.dispatch({ kind: "search", msg: { kind: "typed", query: value } });
	}

	/** A key in a field of the view: whether the block takes it (the search's arrows, Enter, Escape), so the field and Obsidian do not. */
	private fieldKey(field: string, key: string): boolean {
		const msg = field === SEARCH_FIELD ? searchFieldKey(key) : null;
		if (msg) this.dispatch({ kind: "search", msg });
		return msg !== null;
	}

	/** Cmd+Z and Cmd+Shift+Z in the block; in a field they stay the field's, taking typing back. */
	private key(key: BlockKey, frame: HTMLElement): boolean {
		if (key !== "find" && Focus.inField(frame)) return true;
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
			case "focus": {
				const island = this.editors.focusTarget(command.field);
				if (island) return Focus.element(island);
				this.focusing = command.field;
				return this.focusNow();
			}
			case "blur":
				return Focus.leave(this.node);
			case "show": {
				const target = MeasureOf.toShow(this.node, command.key);
				if (target) Scroll.glide(target.scroller, target.top);
				dispatch(command.then);
				return;
			}
			case "timer":
				return this.input.timer(this.node, command.name, command.ms, () => dispatch(command.msg));
			case "cancelTimer":
				return this.input.cancelTimer(command.name);
			case "noteSearch":
			case "entryCall":
				return;
			case "measureCarry": {
				const stack = this.stack();
				if (stack) dispatch(command.measured(Measure.carry(stack)));
				this.over();
				return;
			}
			case "fly":
				return this.motion.fly(this.overlay.node, command.to, () => dispatch(command.done));
			case "openTasksFile":
				return this.deps.openTasksFile(command.line);
		}
	}

	/** The block goes (its note closed, no project's any more, the plugin unloading): everything it started ends. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.endFinger();
		this.deps.session.teardown();
		this.motion.dispose();
		this.measure.dispose();
		this.input.dispose();
		this.islands.dispose();
		this.keys?.dispose();
		this.editors.dispose();
		render(null, this.node);
		this.overlay.dispose();
		this.mountNode.remove();
	}
}

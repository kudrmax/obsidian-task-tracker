import type { App } from "obsidian";
import { render } from "preact";
import type { Cmd, HostSession, Program, RuntimeEvent, Store, Views } from "../../../../runtime/Runtime";
import { Chrome } from "../../drivers/chrome";
import { Focus } from "../../drivers/focus";
import { Input, PRESSED } from "../../drivers/input";
import { type BlockKey, Keys } from "../../drivers/keys";
import { Measure } from "../../drivers/measure";
import { Motion } from "../../drivers/motion";
import { OverlayHost } from "../../drivers/overlay";
import { EdgeScroll } from "../../drivers/scroll";
import { type BlockModel, blockModel, blockNeeds, projectsView, rowVars, settings, shownLists } from "../../model/block";
import type { CarryMsg, CarryTarget } from "../../model/carry";
import { targetAt } from "../../model/carryPlace";
import { carryVars } from "../../model/carryView";
import { type Gesture, IDLE, press, type PressInput, type PressState } from "../../recognizers/press";
import type { Command } from "../../model/commands";
import type { Act, BlockMsg } from "../../model/messages";
import { updateBlock } from "../../update/block";
import { menuVars, openMenu } from "../../model/menuNeeds";
import { BlockRoot } from "../../view/BlockRoot";

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
}

/** The block's program for the runtime's store (P2): the model's update, its needs, the runtime's events as messages. */
function blockProgram(effects: (command: Command<BlockMsg>, dispatch: (msg: BlockMsg) => void) => void): Program<BlockModel, BlockMsg> {
	const cmdOf = (command: Command<BlockMsg>): Cmd<BlockMsg> =>
		command.kind === "door" ? { kind: "door", method: command.method, args: command.args, reply: (outcome) => command.reply(outcome) } : { kind: "effect", run: (dispatch) => effects(command, dispatch) };
	return {
		update: (model, msg) => {
			const [next, commands] = updateBlock(model, msg);
			return [next, commands.map(cmdOf)];
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
		doc: Document,
	) {
		this.node = doc.createElement("div");
		this.overlay = new OverlayHost(doc);
		this.motion = new Motion(this.node);
		this.store = deps.session.store(blockProgram((command, dispatch) => this.run(command, dispatch)), blockModel(note, Chrome.wide()), { render: (model) => this.draw(model) });
	}

	/** The block is on the page: drawn at once, its presses and keys its own. */
	mount(): void {
		const acted = (act: Act) => this.dispatch({ kind: "acted", act });
		this.input.acts(this.node, acted, PRESSED);
		this.input.acts(this.overlay.node, acted);
		this.input.presses(this.node, (raw) => this.feed(raw), () => this.store.model.carry !== null);
		this.input.escape(
			this.node.ownerDocument,
			() => this.store.model.carry?.phase === "carried" || (this.store.model.select !== null && this.store.model.layers.length === 0),
			() => this.dispatch(this.store.model.carry ? { kind: "carry", msg: { kind: "cancel" } } : { kind: "select", msg: { kind: "stop" } }),
		);
		this.store.flush();
		this.input.fields(this.overlay.node, acted);
		this.input.enter(
			this.node.ownerDocument,
			() => openMenu(this.store.model)?.asking != null,
			() => this.dispatch({ kind: "menu", msg: { kind: "confirm" } }),
		);
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
		this.motion.after(moved ? model.motion.cause : "none", new Map([...rowVars(shownLists(model)), ...carryVars(model)]));
		const frame = this.node.firstElementChild;
		if (frame instanceof HTMLElement) Motion.holdHeight(frame, model.carry !== null);
		this.motion.layerVars(this.overlay.node, menuVars(model));
		const menu = openMenu(model);
		this.motion.menu(this.overlay.node, this.node, menu?.place ?? null, (place) => this.dispatch({ kind: "menu", msg: { kind: "placed", place } }));
		this.motion.layers(this.overlay.node, this.node, () => this.dispatch({ kind: "layerGone" }));
		this.attach();
		this.focusNow();
	}

	/**
	 * The field a typing pick asked for takes the focus as soon as it can: a menu's page measured before it shows draws
	 * once more in the same pass, still inside the user's event (P2).
	 */
	private focusNow(): void {
		if (this.focusing !== null && Focus.field(this.node.ownerDocument, this.focusing)) this.focusing = null;
	}

	/** The block's frame, drawn once: its presses stop at it, a press focuses it, its keys stand over Obsidian's while it holds the focus. */
	private attach(): void {
		const frame = this.node.firstElementChild;
		if (!(frame instanceof HTMLElement) || frame === this.frame) return;
		this.frame = frame;
		this.input.shield(frame, () => Focus.take(frame));
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
		const stack = this.node.querySelector("[data-n-stack]");
		return stack instanceof HTMLElement ? stack : null;
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
				this.focusing = command.field;
				return this.focusNow();
			case "timer":
				return this.input.timer(this.node, command.name, command.ms, () => dispatch(command.msg));
			case "cancelTimer":
				return this.input.cancelTimer(command.name);
			case "noteSearch":
				return;
			case "measureCarry": {
				const stack = this.stack();
				if (stack) dispatch(command.measured(Measure.carry(stack)));
				this.over();
				return;
			}
			case "fly": {
				let to: Element | null = null;
				if (command.to !== null) for (const el of this.node.querySelectorAll<HTMLElement>("[data-n-key]")) if (el.dataset.nKey === command.to) to = el;
				this.motion.fly(this.overlay.node, to, () => dispatch(command.done));
				return;
			}
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
		this.keys?.dispose();
		render(null, this.node);
		this.overlay.dispose();
		this.node.remove();
	}
}

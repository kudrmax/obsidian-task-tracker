import type { App } from "obsidian";
import { render } from "preact";
import type { Cmd, HostSession, Program, RuntimeEvent, Store, Views } from "../../../../runtime/Runtime";
import { Chrome } from "../../drivers/chrome";
import { Focus } from "../../drivers/focus";
import { Input } from "../../drivers/input";
import { type BlockKey, Keys } from "../../drivers/keys";
import { Measure } from "../../drivers/measure";
import { Motion } from "../../drivers/motion";
import { OverlayHost } from "../../drivers/overlay";
import { type BlockModel, blockModel, blockNeeds, rowVars, shownLists } from "../../model/block";
import type { Command } from "../../model/commands";
import type { Act, BlockMsg } from "../../model/messages";
import { updateBlock } from "../../update/block";
import { menuVars, openMenu } from "../../model/menuNeeds";
import { BlockRoot } from "../../view/BlockRoot";

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
		this.input.acts(this.node, acted);
		this.input.acts(this.overlay.node, acted);
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
		this.motion.after(moved ? model.motion.cause : "none", rowVars(shownLists(model)));
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
			case "openTasksFile":
				return this.deps.openTasksFile(command.line);
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
		this.keys?.dispose();
		render(null, this.node);
		this.overlay.dispose();
		this.node.remove();
	}
}

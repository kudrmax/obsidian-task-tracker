import { type App, type KeymapEventHandler, type Modifier, Scope } from "obsidian";

export type BlockKey = "undo" | "redo" | "find";

/**
 * The keys driver (§Architecture): a block's own keys over Obsidian's while the focus is in it (Cmd+Z, Cmd+Shift+Z,
 * Cmd+F), so none reaches the note. The scope is pushed while the focus is inside and popped when it leaves or the
 * block goes. A handler answering true lets the key go on (a field keeps its own typing's undo).
 */
export class Keys {
	private readonly scope: Scope;
	private scoped = false;
	private readonly handlers: KeymapEventHandler[] = [];
	private readonly stops: (() => void)[] = [];

	constructor(
		private readonly app: App,
		el: HTMLElement,
		on: (key: BlockKey) => boolean,
	) {
		this.scope = new Scope(app.scope);
		this.handlers.push(
			this.scope.register(["Mod"], "z", () => on("undo")),
			this.scope.register(["Mod", "Shift"], "z", () => on("redo")),
			this.scope.register(["Mod"], "f", () => on("find")),
		);
		const focusIn = () => this.hold(true);
		const focusOut = (e: FocusEvent) => {
			if (!(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) this.hold(false);
		};
		el.addEventListener("focusin", focusIn);
		el.addEventListener("focusout", focusOut);
		this.stops.push(() => el.removeEventListener("focusin", focusIn), () => el.removeEventListener("focusout", focusOut));
	}

	/**
	 * A title field's own keys, over the block's while the field has the focus: Option+Tab switches it (a command may
	 * hold the key, Templater does), and the line commands' hotkeys do nothing in it.
	 */
	field(onSwitch: () => void, lines: readonly { readonly modifiers: readonly Modifier[]; readonly key: string }[]): { hold(on: boolean): void; dispose(): void } {
		const scope = new Scope(this.scope);
		for (const { modifiers, key } of lines) scope.register([...modifiers], key, () => false);
		scope.register(["Alt"], "Tab", () => {
			onSwitch();
			return false;
		});
		let held = false;
		const hold = (on: boolean) => {
			if (on === held) return;
			held = on;
			if (on) this.app.keymap.pushScope(scope);
			else this.app.keymap.popScope(scope);
		};
		return { hold, dispose: () => hold(false) };
	}

	private hold(on: boolean): void {
		if (on === this.scoped) return;
		this.scoped = on;
		if (on) this.app.keymap.pushScope(this.scope);
		else this.app.keymap.popScope(this.scope);
	}

	dispose(): void {
		this.hold(false);
		this.stops.splice(0).forEach((stop) => stop());
		this.handlers.splice(0).forEach((handler) => this.scope.unregister(handler));
	}
}

/**
 * Obsidian's editor commands that change what a line is (a checkbox, a list, a heading, a quote, a block) or move lines.
 * A description's lines sit under its task's line: run there, they would turn a line into a subtask or a second task.
 */
const LINE_COMMANDS: readonly string[] = [
	"editor:toggle-checklist-status",
	"editor:cycle-list-checklist",
	"editor:toggle-bullet-list",
	"editor:toggle-numbered-list",
	"editor:toggle-blockquote",
	"editor:set-heading",
	"editor:set-heading-0",
	"editor:set-heading-1",
	"editor:set-heading-2",
	"editor:set-heading-3",
	"editor:set-heading-4",
	"editor:set-heading-5",
	"editor:set-heading-6",
	"editor:insert-callout",
	"editor:insert-codeblock",
	"editor:insert-mathblock",
	"editor:insert-table",
	"editor:insert-horizontal-rule",
	"editor:swap-line-up",
	"editor:swap-line-down",
	"editor:indent-list",
	"editor:unindent-list",
];

interface Hotkey {
	readonly modifiers: readonly Modifier[];
	readonly key: string;
}

/** The hotkeys Obsidian runs a command on: the ones set in its settings, else its own. Obsidian doesn't publish them. */
interface Hotkeys {
	getHotkeys(id: string): readonly Hotkey[] | undefined;
	getDefaultHotkeys(id: string): readonly Hotkey[] | undefined;
}

/** The line commands' keys held while an editor of the block has the focus: in Obsidian's scopes, and as CodeMirror names them. */
export interface LineKeys {
	/** The keys as CodeMirror names them (`Mod-l`): Obsidian's editor runs its commands from its own keymap first, so the editor takes them. */
	readonly codeMirror: readonly string[];
	/** A scope taking them, doing nothing, over Obsidian's while `on`. */
	hold(on: boolean): void;
}

export function lineKeys(app: App): LineKeys {
	const hotkeys = (app as unknown as { readonly hotkeyManager?: Hotkeys }).hotkeyManager;
	const found = hotkeys ? LINE_COMMANDS.flatMap((id) => hotkeys.getHotkeys(id) ?? hotkeys.getDefaultHotkeys(id) ?? []) : [];
	const scope = new Scope(app.scope);
	for (const { modifiers, key } of found) scope.register([...modifiers], key, () => false);
	let held = false;
	return {
		codeMirror: found.map(({ modifiers, key }) => [...modifiers, key.length === 1 ? key.toLowerCase() : key].join("-")),
		hold: (on) => {
			if (on === held) return;
			held = on;
			if (on) app.keymap.pushScope(scope);
			else app.keymap.popScope(scope);
		},
	};
}

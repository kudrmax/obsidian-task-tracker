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

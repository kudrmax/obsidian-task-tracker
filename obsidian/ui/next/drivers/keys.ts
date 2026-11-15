import { type App, type KeymapEventHandler, Scope } from "obsidian";

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

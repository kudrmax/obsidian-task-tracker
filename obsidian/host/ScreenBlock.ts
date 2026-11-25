import { type App, MarkdownRenderChild, type Scope } from "obsidian";
import type { MountedScreen } from "../ui/engine/mount";
import type { ScreenContext } from "../ui/engine/port";
import type { ScreenHost } from "./ScreenHost";
import { screenKeyScope } from "./screenKeys";

/** The class every note's block of the screen wears: its size and ground (the stylesheet's `.tc-note-block`). */
const NOTE_BLOCK = "tc-note-block";

/**
 * `TaskScreen` at `note` inside a note (F5's block, a project note's view): mounted once loaded, in `context`. The note's
 * editor puts its cursor where a press lands below its text; the block's own presses stop at it.
 */
export class ScreenBlock extends MarkdownRenderChild {
	private screen: MountedScreen | null = null;
	private gone = false;
	/** The screen's keys over Obsidian's while the focus is in the block (F283): the note's ⌘Z and ⌘F don't reach the note. */
	private readonly keys: Scope;
	private keysOn = false;

	constructor(
		readonly el: HTMLElement,
		private readonly host: ScreenHost,
		private readonly sourcePath: string,
		private readonly context?: ScreenContext,
	) {
		super(el);
		el.addClass(NOTE_BLOCK);
		el.tabIndex = -1;
		this.keys = screenKeyScope(this.app.scope, true, () => this.screen);
	}

	private get app(): App {
		return this.host.app;
	}

	override onload(): void {
		for (const type of ["mousedown", "click", "dblclick"] as const) this.registerDomEvent(this.el, type, (e) => e.stopPropagation());
		/** A press in the block puts the focus there (unless a field inside has it), so its keys are the screen's. */
		this.registerDomEvent(this.el, "pointerdown", () => {
			if (!this.el.contains(this.el.ownerDocument.activeElement)) this.el.focus({ preventScroll: true });
		});
		this.registerDomEvent(this.el, "focusin", () => this.holdKeys(true));
		this.registerDomEvent(this.el, "focusout", (e) => {
			if (!(e.relatedTarget instanceof Node && this.el.contains(e.relatedTarget))) this.holdKeys(false);
		});
		void this.host.mounts().then((mounts) => {
			if (!this.gone) this.screen = mounts.mount(this.el, "note", this.sourcePath, this.context);
		});
	}

	override onunload(): void {
		this.gone = true;
		this.holdKeys(false);
		this.host.unmount(this.screen);
		this.screen = null;
	}

	private holdKeys(on: boolean): void {
		if (on === this.keysOn) return;
		this.keysOn = on;
		if (on) this.app.keymap.pushScope(this.keys);
		else this.app.keymap.popScope(this.keys);
	}
}

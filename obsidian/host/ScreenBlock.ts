import { MarkdownRenderChild } from "obsidian";
import type { MountedScreen } from "../ui/engine/mount";
import type { ScreenContext } from "../ui/engine/port";
import type { ScreenHost } from "./ScreenHost";

/** The class every note's block of the screen wears: its size and ground (the stylesheet's `.tc-note-block`). */
export const NOTE_BLOCK = "tc-note-block";

/**
 * `TaskScreen` at `note` inside a note (F5's block, a project note's view): mounted once loaded, in `context`. The note's
 * editor puts its cursor where a press lands below its text; the block's own presses stop at it.
 */
export class ScreenBlock extends MarkdownRenderChild {
	private screen: MountedScreen | null = null;
	private gone = false;

	constructor(
		readonly el: HTMLElement,
		private readonly host: ScreenHost,
		private readonly sourcePath: string,
		private readonly context?: ScreenContext,
	) {
		super(el);
		el.addClass(NOTE_BLOCK);
	}

	override onload(): void {
		for (const type of ["mousedown", "click", "dblclick"] as const) this.registerDomEvent(this.el, type, (e) => e.stopPropagation());
		void this.host.mounts().then((mounts) => {
			if (!this.gone) this.screen = mounts.mount(this.el, "note", this.sourcePath, this.context);
		});
	}

	override onunload(): void {
		this.gone = true;
		this.host.unmount(this.screen);
		this.screen = null;
	}
}

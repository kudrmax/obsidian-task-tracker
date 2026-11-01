import { LAYOUT, tokenPx } from "../design";
import { el, px } from "../dom";
import type { MarkdownSurface } from "../markdown/MarkdownSurface";
import type { Overlay } from "./Overlay";

export interface PeekActions {
	/** A tap on the text: the whole description. */
	onRead(): void;
	/** A tap on a link: it opens as in a note, the menu goes. */
	onLink(): void;
}

/**
 * The start of a task's description over the copy of its card in the menu, drawn by Obsidian. It takes the side of the
 * copy the menu leaves free, or, with too little room there, the far side of the menu; what does not fit fades out.
 */
export class DescriptionPeek {
	private readonly el: HTMLElement;

	constructor(overlay: Overlay, surface: MarkdownSurface, markdown: string, actions: PeekActions) {
		this.el = overlay.add(el(null, "div", "tc-desc-peek"));
		const text = el(this.el, "div", "tc-desc-text");
		this.el.addEventListener("click", (e) => ((e.target as Element).closest("a") ? actions.onLink() : actions.onRead()));
		void surface.render(text, markdown).then(() => this.markCut());
	}

	/** By the copy and the menu panel as they stand now; the menu is placed first. */
	place(copy: DOMRect, menu: HTMLElement): void {
		const gap = LAYOUT.descPeekGap;
		const margin = tokenPx(this.el, "--tc-whole-margin");
		const least = LAYOUT.descPeekLeast;
		const menuSpan = tokenPx(menu, "--tc-menu-gap") + menu.offsetHeight;
		const height = window.innerHeight;
		const menuAbove = menu.classList.contains("is-above");
		const freeAbove = copy.top - gap - margin;
		const freeBelow = height - copy.bottom - gap - margin;
		let room: number;
		if (!menuAbove && freeAbove >= least) room = this.standOver(copy.top - gap, freeAbove);
		else if (menuAbove && freeBelow >= least) room = this.standUnder(copy.bottom + gap, freeBelow);
		else if (menuAbove) room = this.standOver(copy.top - menuSpan - gap, copy.top - menuSpan - gap - margin);
		else room = this.standUnder(copy.bottom + menuSpan + gap, height - copy.bottom - menuSpan - gap - margin);
		this.el.style.left = px(Math.max(margin, Math.min(copy.left, window.innerWidth - margin - this.el.offsetWidth)));
		this.el.style.maxHeight = px(Math.max(0, Math.min(tokenPx(this.el, "--tc-desc-peek-max"), room)));
		this.markCut();
	}

	private standOver(bottom: number, room: number): number {
		this.el.classList.remove("is-under");
		this.el.style.top = "";
		this.el.style.bottom = px(window.innerHeight - bottom);
		return room;
	}

	private standUnder(top: number, room: number): number {
		this.el.classList.add("is-under");
		this.el.style.bottom = "";
		this.el.style.top = px(top);
		return room;
	}

	private markCut(): void {
		this.el.classList.toggle("is-cut", this.el.scrollHeight > this.el.clientHeight);
	}
}

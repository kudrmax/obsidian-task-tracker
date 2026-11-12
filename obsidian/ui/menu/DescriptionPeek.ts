import { LAYOUT, tokenPx } from "../design";
import { el, px } from "../dom";
import { Panel, type Picks } from "../kit/Panel";
import type { MarkdownSurface } from "../markdown/MarkdownSurface";
import type { Overlay } from "./Overlay";

/** The peek fades away and back with the overlay's motion: it is never taken off in one frame. */
const AWAY = "is-away";

export interface PeekActions {
	/** A tap on the text: the menu goes, then the whole description. */
	onRead(): void;
	/** A tap on a link: it opens as in a note, the menu goes. */
	onLink(): void;
}

/**
 * The start of a task's description over the copy of its card in the menu, drawn by Obsidian. It takes the side of the
 * copy the menu leaves free, or, with too little room there, the far side of the menu; what does not fit fades out, and
 * with no room on either side it stays away. A menu split over and under the copy leaves it the room beside its upper
 * part, over the copy, or beside its lower part, under it, where the window is wide enough.
 */
export class DescriptionPeek {
	private readonly el: HTMLElement;
	private readonly text: HTMLElement;

	/** The peek of `markdown`, the description as the task has it: none for a task without one, or with nothing to draw it with. */
	static open(overlay: Overlay, picks: Picks, surface: MarkdownSurface | null, markdown: string | null, actions: PeekActions): DescriptionPeek | null {
		return surface && markdown !== null ? new DescriptionPeek(overlay, picks, surface, markdown, actions) : null;
	}

	/** `picks`: the menu's, which a tap on the text closes. */
	private constructor(overlay: Overlay, picks: Picks, surface: MarkdownSurface, markdown: string, actions: PeekActions) {
		const panel = Panel.over(overlay, { root: "tc-desc-peek", picks });
		this.el = panel.el;
		const text = (this.text = el(this.el, "div", "tc-desc-text"));
		const read = panel.pick(() => actions.onRead());
		this.el.addEventListener("click", (e) => ((e.target as Element).closest("a") ? actions.onLink() : read()));
		void surface.render(text, markdown).then(() => this.markCut());
	}

	/** By the copy and the menu panel as they stand now; the menu is placed first. */
	place(copy: DOMRect, menu: HTMLElement): void {
		const gap = LAYOUT.descPeekGap;
		const margin = tokenPx(this.el, "--tc-whole-margin");
		const least = LAYOUT.descPeekLeast;
		const menuSpan = tokenPx(menu, "--tc-menu-gap") + menu.offsetHeight;
		const height = activeWindow.innerHeight;
		const menuAbove = menu.classList.contains("is-above");
		const freeAbove = copy.top - gap - margin;
		const freeBelow = height - copy.bottom - gap - margin;
		let room: number;
		if (!menuAbove && freeAbove >= least) room = this.standOver(copy.top - gap, freeAbove);
		else if (menuAbove && freeBelow >= least) room = this.standUnder(copy.bottom + gap, freeBelow);
		else if (menuAbove) room = this.standOver(copy.top - menuSpan - gap, copy.top - menuSpan - gap - margin);
		else room = this.standUnder(copy.bottom + menuSpan + gap, height - copy.bottom - menuSpan - gap - margin);
		this.el.classList.toggle(AWAY, room < least);
		this.el.style.left = px(Math.max(margin, Math.min(copy.left, activeWindow.innerWidth - margin - this.el.offsetWidth)));
		this.el.style.maxHeight = px(Math.max(0, Math.min(tokenPx(this.el, "--tc-desc-peek-max"), room)));
		this.markCut();
	}

	/**
	 * By the copy and a menu split over and under it, `upper` its part over the copy, as they stand now: right of the menu,
	 * over the copy, else under it where there is more room; away where the window leaves the menu no side.
	 */
	placeBeside(copy: DOMRect, upper: HTMLElement): void {
		const gap = LAYOUT.descPeekGap;
		const margin = tokenPx(this.el, "--tc-whole-margin");
		const least = LAYOUT.descPeekLeast;
		const start = parseFloat(upper.style.left) + upper.offsetWidth + tokenPx(upper, "--tc-menu-gap");
		const fits = start + this.el.offsetWidth <= activeWindow.innerWidth - margin;
		const freeAbove = copy.top - gap - margin;
		const freeBelow = activeWindow.innerHeight - copy.bottom - gap - margin;
		let room = 0;
		if (fits && freeAbove >= least) room = this.standOver(copy.top - gap, freeAbove);
		else if (fits) room = this.standUnder(copy.bottom + gap, freeBelow);
		this.el.classList.toggle(AWAY, room < least);
		this.el.style.left = px(start);
		this.el.style.maxHeight = px(Math.max(0, Math.min(tokenPx(this.el, "--tc-desc-peek-max"), room)));
		this.markCut();
	}

	/** Fades away while the menu is typed in: the field and its bar need its room. */
	hide(): void {
		this.el.classList.add(AWAY);
	}

	private standOver(bottom: number, room: number): number {
		this.el.classList.remove("is-under");
		this.el.style.top = "";
		this.el.style.bottom = px(activeWindow.innerHeight - bottom);
		return room;
	}

	private standUnder(top: number, room: number): number {
		this.el.classList.add("is-under");
		this.el.style.bottom = "";
		this.el.style.top = px(top);
		return room;
	}

	private markCut(): void {
		this.el.classList.toggle("is-cut", this.text.scrollHeight > this.text.clientHeight);
	}
}

import { tokenPx } from "../design";
import { el, px } from "../dom";
import { type ListFrame, toContent } from "./listFrame";

/**
 * Where a new task carried on the plus will stand: the calendar's drop line between two cards, from a dot at the left
 * edge of the level it picks to the list's right edge. Drawn inside the list, so it scrolls with the cards, which stay
 * where they are. It comes out of the plus: a dot at the finger that runs to its place and stretches into the line.
 */
export class DropLine {
	private el: HTMLElement | null = null;

	constructor(private readonly list: () => HTMLElement) {}

	/** Through `y` from `left` to `right`, in client pixels of the list as `frame` read it; a new line comes out of the plus at `finger`. */
	show(left: number, right: number, y: number, frame: ListFrame, finger: { readonly x: number; readonly y: number }): void {
		const list = this.list();
		if (!this.el || this.el.parentElement !== list) {
			this.el?.remove();
			const dot = tokenPx(list, "--tc-drop-dot");
			this.el = el(null, "div", "tc-list-drop");
			el(this.el, "div", "tc-list-drop-dot");
			el(this.el, "div", "tc-drop-line");
			this.place(frame, finger.x - dot / 2, finger.x + dot / 2, finger.y);
			list.appendChild(this.el);
			void this.el.offsetWidth;
		}
		this.place(frame, left, right, y);
		this.el.classList.add("is-shown");
	}

	/** Placed before the line joins the list, so a new one first stands at the plus, not at the list's corner. */
	private place(frame: ListFrame, left: number, right: number, y: number): void {
		const at = toContent(frame, left, y);
		this.el!.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
		this.el!.style.width = px(right - left);
	}

	hide(): void {
		this.el?.remove();
		this.el = null;
	}
}

import { el, px } from "../dom";
import { type ListFrame, toContent } from "./listFrame";

/**
 * Where a new task carried on the plus will stand: the calendar's drop line between two cards, from a dot at the left
 * edge of the level it picks to the list's right edge. Drawn inside the list, so it scrolls with the cards, which stay
 * where they are.
 */
export class DropLine {
	private el: HTMLElement | null = null;

	constructor(private readonly list: () => HTMLElement) {}

	/** Through `y` from `left` to `right`, in client pixels of the list as `frame` read it. */
	show(left: number, right: number, y: number, frame: ListFrame): void {
		const list = this.list();
		if (!this.el || this.el.parentElement !== list) {
			this.el?.remove();
			this.el = el(list, "div", "tc-list-drop");
			el(this.el, "div", "tc-list-drop-dot");
			el(this.el, "div", "tc-drop-line");
		}
		const at = toContent(frame, left, y);
		this.el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
		this.el.style.width = px(right - left);
	}

	hide(): void {
		this.el?.remove();
		this.el = null;
	}
}

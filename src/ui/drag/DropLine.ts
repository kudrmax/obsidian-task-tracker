import { el, px } from "../dom";

/**
 * Where a new task carried on the plus will stand: the calendar's drop line between two cards, from a dot at the left
 * edge of the level it picks to the list's right edge. Drawn inside the list, so it scrolls with the cards, which stay
 * where they are.
 */
export class DropLine {
	private el: HTMLElement | null = null;

	constructor(private readonly list: () => HTMLElement) {}

	/** Through `y` from `left` to `right`, in client pixels. */
	show(left: number, right: number, y: number): void {
		const list = this.list();
		if (!this.el || this.el.parentElement !== list) {
			this.el?.remove();
			this.el = el(list, "div", "tc-list-drop");
			el(this.el, "div", "tc-list-drop-dot");
			el(this.el, "div", "tc-drop-line");
		}
		const box = list.getBoundingClientRect();
		const x = left - box.left - list.clientLeft + list.scrollLeft;
		const top = y - box.top - list.clientTop + list.scrollTop;
		this.el.style.transform = `translate3d(${x}px, ${top}px, 0)`;
		this.el.style.width = px(right - left);
	}

	hide(): void {
		this.el?.remove();
		this.el = null;
	}
}

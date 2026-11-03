import { tokenPx } from "../design";
import { el, px } from "../dom";

/**
 * Where a new task carried on the plus will stand: the calendar's drop line between two cards, from a dot at the left
 * edge of the level it picks to the list's right edge. Drawn inside the list, so it scrolls with the cards, which stay
 * where they are. It comes out of the plus: a dot at the finger that runs to its place and stretches into the line.
 */
export class DropLine {
	private el: HTMLElement | null = null;

	constructor(private readonly list: () => HTMLElement) {}

	/** Through `y` from `left` to `right`, in client pixels; a new line comes out of the plus at `finger`. */
	show(left: number, right: number, y: number, finger: { readonly x: number; readonly y: number }): void {
		const list = this.list();
		const box = list.getBoundingClientRect();
		if (!this.el || this.el.parentElement !== list) {
			this.el?.remove();
			const dot = tokenPx(list, "--tc-drop-dot");
			this.el = el(null, "div", "tc-list-drop");
			el(this.el, "div", "tc-list-drop-dot");
			el(this.el, "div", "tc-drop-line");
			this.place(list, box, finger.x - dot / 2, finger.x + dot / 2, finger.y);
			list.appendChild(this.el);
			void this.el.offsetWidth;
		}
		this.place(list, box, left, right, y);
		this.el.classList.add("is-shown");
	}

	/** Measured before the line joins the list, so a new one first stands at the plus, not at the list's corner. */
	private place(list: HTMLElement, box: DOMRect, left: number, right: number, y: number): void {
		const x = left - box.left - list.clientLeft + list.scrollLeft;
		const top = y - box.top - list.clientTop + list.scrollTop;
		this.el!.style.transform = `translate3d(${x}px, ${top}px, 0)`;
		this.el!.style.width = px(right - left);
	}

	hide(): void {
		this.el?.remove();
		this.el = null;
	}
}

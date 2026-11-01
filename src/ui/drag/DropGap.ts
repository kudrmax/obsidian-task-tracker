import { DURATION, tokenMs } from "../design";
import { px } from "../dom";

const SHOWN = "is-shown";

/**
 * The dashed place a dragged card will land in, drawn inside the list so it scrolls with the cards. It eases from place to
 * place as the cards step aside, and fades out while the finger is over a card, its room kept open.
 */
export class DropGap {
	private el: HTMLElement | null = null;
	private leaving = 0;

	constructor(private readonly list: () => HTMLElement) {}

	/** At `rect`, in client pixels; `visible` false keeps it there, faded out. A new one stands there at once and fades in. */
	show(rect: DOMRect, visible: boolean): void {
		const list = this.list();
		window.clearTimeout(this.leaving);
		const fresh = !this.el || this.el.parentElement !== list;
		if (fresh) {
			this.el?.remove();
			this.el = list.ownerDocument.createElement("div");
			this.el.className = "tc-drop-gap";
		}
		const el = this.el!;
		const box = list.getBoundingClientRect();
		const left = rect.left - box.left - list.clientLeft + list.scrollLeft;
		const top = rect.top - box.top - list.clientTop + list.scrollTop;
		el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
		el.style.width = px(rect.width);
		if (fresh) {
			list.appendChild(el);
			void el.offsetWidth;
		}
		el.classList.toggle(SHOWN, visible);
	}

	/** Fades out, then goes. */
	hide(): void {
		const el = this.el;
		if (!el) return;
		el.classList.remove(SHOWN);
		window.clearTimeout(this.leaving);
		this.leaving = window.setTimeout(() => {
			el.remove();
			if (this.el === el) this.el = null;
		}, tokenMs(el, DURATION.collapse));
	}
}

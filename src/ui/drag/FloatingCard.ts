import type { TaskItem } from "../../application/contracts";
import type { LocalDate } from "../types";
import { DESIGN, DURATION, tokenMs } from "../design";
import { px } from "../dom";
import { fillCard } from "../TaskCard";
import { showWhole } from "../wholeCard";
import type { Float } from "./DropTarget";

export interface Grab {
	readonly dx: number;
	readonly dy: number;
}

const SETTLE_MS = 20;

/** The copy of the card that follows the finger: fixed over everything, moved by transform alone, its whole title wrapped in its width. */
export class FloatingCard implements Float {
	readonly el: HTMLElement;

	constructor(item: TaskItem, private readonly grab: Grab, day: LocalDate) {
		this.el = document.createElement("div");
		this.el.className = "tc-float";
		fillCard(this.el, item, { day });
		document.body.appendChild(this.el);
		showWhole(this.el, { width: DESIGN.floatWidth, height: DESIGN.floatHeight }, DESIGN.floatWidth);
	}

	moveTo(x: number, y: number): void {
		this.el.style.transform = `translate3d(${x - this.grab.dx}px, ${y - this.grab.dy}px, 0)`;
	}

	raiseTo(x: number, bottom: number): void {
		this.el.style.transform = `translate3d(${x - this.grab.dx}px, ${bottom - this.el.offsetHeight}px, 0)`;
	}

	/** Slides to the rect, taking its size and the look of a card at rest, its title on one line again. */
	async flyTo(rect: DOMRect): Promise<void> {
		this.el.classList.remove("is-whole");
		this.el.classList.add("is-flying");
		void this.el.offsetWidth;
		this.el.classList.add("is-landed");
		this.el.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
		this.el.style.width = px(rect.width);
		this.el.style.height = px(rect.height);
		await new Promise((resolve) => window.setTimeout(resolve, tokenMs(this.el, DURATION.fly) + SETTLE_MS));
	}

	remove(): void {
		this.el.remove();
	}
}

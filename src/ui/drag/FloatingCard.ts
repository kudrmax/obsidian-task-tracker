import type { TaskItem } from "../../application/contracts";
import type { LocalDate } from "../types";
import { DESIGN, DURATION, tokenMs, tokenPx } from "../design";
import { px } from "../dom";
import { fillCard } from "../TaskCard";
import { roomWidth, stretchWhole, windowRoom } from "../wholeCard";
import type { Float } from "./DropTarget";

export interface Grab {
	readonly dx: number;
	readonly dy: number;
}

const SETTLE_MS = 20;

/** The layers under a task that carries its subtasks along. */
const STACK_DEPTH = 2;

/**
 * The copy of the card that follows the finger: fixed over everything, moved by transform alone, stretched to the right
 * to show its whole title. A task with subtasks carries them as a stack of layers under it.
 */
export class FloatingCard implements Float {
	readonly el: HTMLElement;
	private readonly stack: HTMLElement[] = [];

	constructor(item: TaskItem, private readonly grab: Grab, day: LocalDate) {
		this.el = document.createElement("div");
		this.el.className = "tc-float";
		fillCard(this.el, item, { day });
		if (item.subtasks.length > 0) {
			for (let depth = STACK_DEPTH; depth >= 1; depth--) this.stack.push(document.body.appendChild(Object.assign(document.createElement("div"), { className: `tc-float-under is-${depth}` })));
		}
		document.body.appendChild(this.el);
		stretchWhole(this.el, { width: DESIGN.floatWidth, height: this.el.getBoundingClientRect().height }, roomWidth(windowRoom(this.el)));
		this.fitStack();
	}

	/** Each layer is narrower by the inset on both sides than the one over it. */
	private fitStack(): void {
		const inset = tokenPx(this.el, "--tc-stack-inset");
		this.stack.forEach((layer, i) => (layer.style.width = px(this.el.offsetWidth - 2 * inset * (STACK_DEPTH - i))));
	}

	moveTo(x: number, y: number): void {
		const transform = `translate3d(${x - this.grab.dx}px, ${y - this.grab.dy}px, 0)`;
		this.el.style.transform = transform;
		for (const layer of this.stack) layer.style.transform = transform;
	}

	/** Slides to the rect, taking its size and the look of a card at rest, its title fading at the edge again. */
	async flyTo(rect: DOMRect): Promise<void> {
		for (const layer of this.stack) layer.classList.add("is-gone");
		this.el.classList.remove("is-stretched");
		this.el.classList.add("is-flying");
		void this.el.offsetWidth;
		this.el.classList.add("is-landed");
		this.el.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
		this.el.style.width = px(rect.width);
		this.el.style.height = px(rect.height);
		await new Promise((resolve) => window.setTimeout(resolve, tokenMs(this.el, DURATION.fly) + SETTLE_MS));
	}

	remove(): void {
		for (const layer of this.stack) layer.remove();
		this.el.remove();
	}
}

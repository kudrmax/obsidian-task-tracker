import type { TaskItem } from "../../application/contracts";
import type { LocalDate } from "../types";
import { DESIGN, DURATION, tokenMs, tokenPx } from "../design";
import { el, px } from "../dom";
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
 * to show its whole title. A task with subtasks carries them as a stack of layers under it, and so do several picked
 * tasks carried at once, with their number on the top card's corner.
 */
export class FloatingCard implements Float {
	readonly el: HTMLElement;
	private readonly stack: HTMLElement[] = [];
	private count: HTMLElement | null = null;

	/** `count`: how many tasks are carried, this one among them. */
	constructor(item: TaskItem, private readonly grab: Grab, day: LocalDate, count = 1) {
		this.el = el(null, "div", "tc-float");
		this.showTask(item, day, count);
	}

	private showTask(item: TaskItem, day: LocalDate, count: number): void {
		fillCard(this.el, item, { day });
		if (item.subtasks.length > 0 || count > 1) {
			for (let depth = STACK_DEPTH; depth >= 1; depth--) this.stack.push(el(document.body, "div", `tc-float-under is-${depth}`));
		}
		document.body.appendChild(this.el);
		stretchWhole(this.el, { width: DESIGN.floatWidth, height: this.el.getBoundingClientRect().height }, roomWidth(windowRoom(this.el)));
		this.fitStack();
		if (count > 1) this.showCount(count);
	}

	/** The number of tasks carried, on the top card's upper right corner, moved along with it. */
	private showCount(count: number): void {
		const badge = (this.count = el(document.body, "div", "tc-float-count", String(count)));
		badge.style.left = px(this.el.offsetWidth);
	}

	/** Each layer is narrower by the inset on both sides than the one over it. */
	private fitStack(): void {
		const inset = tokenPx(this.el, "--tc-stack-step-x");
		this.stack.forEach((layer, i) => (layer.style.width = px(this.el.offsetWidth - 2 * inset * (STACK_DEPTH - i))));
	}

	moveTo(x: number, y: number): void {
		const transform = `translate3d(${x - this.grab.dx}px, ${y - this.grab.dy}px, 0)`;
		this.el.style.transform = transform;
		for (const layer of this.stack) layer.style.transform = transform;
		if (this.count) this.count.style.transform = transform;
	}

	land(rect: DOMRect): Promise<void> {
		return this.flyTo(rect);
	}

	/** Slides to the rect, taking its size and the look of a card at rest, its title fading at the edge again. */
	async flyTo(rect: DOMRect): Promise<void> {
		for (const layer of this.stack) layer.classList.add("is-gone");
		this.count?.classList.add("is-gone");
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
		this.count?.remove();
		this.el.remove();
	}
}

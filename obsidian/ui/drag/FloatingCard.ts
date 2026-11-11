import { grownStart, type TaskItem } from "../../../core/application/contracts";
import type { LocalDate } from "../types";
import { DESIGN, DURATION, tokenMs, tokenPx } from "../design";
import { el, px } from "../dom";
import { fillCard } from "../TaskCard";
import { timingOf } from "../motion/Motion";
import { stretchWhole, windowRoom } from "../wholeCard";
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

	/** `count`: how many tasks are carried, this one among them; `fromWidth`: the lifted card's, which the copy narrows or widens from to its own. */
	constructor(item: TaskItem, private readonly grab: Grab, day: LocalDate, count = 1, fromWidth?: number) {
		this.el = el(null, "div", "tc-float");
		this.showTask(item, day, count);
		if (fromWidth !== undefined) this.growFrom(fromWidth);
	}

	/** The copy takes its width from the card's smoothly, in a card's flight: never in one frame. */
	private growFrom(width: number): void {
		const timing = timingOf(this.el, DURATION.fly);
		const to = this.el.offsetWidth;
		if (timing && Math.abs(to - width) >= 1) this.el.animate([{ width: px(width) }, { width: px(to) }], timing);
	}

	private showTask(item: TaskItem, day: LocalDate, count: number): void {
		fillCard(this.el, item, { day });
		if (item.subtasks.length > 0 || count > 1) {
			const twoLine = this.el.classList.contains("is-two-line") ? " is-two-line" : "";
			for (let depth = STACK_DEPTH; depth >= 1; depth--) this.stack.push(el(activeDocument.body, "div", `tc-float-under is-${depth}${twoLine}`));
		}
		activeDocument.body.appendChild(this.el);
		stretchWhole(this.el, { width: DESIGN.floatWidth, height: this.el.getBoundingClientRect().height }, windowRoom(this.el));
		this.fitStack();
		if (count > 1) this.showCount(count);
	}

	/** The number of tasks carried, on the top card's upper right corner, moved along with it. */
	private showCount(count: number): void {
		const badge = (this.count = el(activeDocument.body, "div", "tc-float-count", String(count)));
		badge.style.left = px(this.el.offsetWidth);
	}

	/** Each layer is narrower by the inset on both sides than the one over it. */
	private fitStack(): void {
		const inset = tokenPx(this.el, "--tc-stack-step-x");
		this.stack.forEach((layer, i) => (layer.style.width = px(this.el.offsetWidth - 2 * inset * (STACK_DEPTH - i))));
	}

	/**
	 * The card under the finger as it was grabbed; stretched further right than the window lets it, it is pulled back
	 * inside the window's margin as the menu's copy is (`grownStart`), never past the card's own end under the finger.
	 */
	moveTo(x: number, y: number): void {
		const room = windowRoom(this.el);
		const left = grownStart(x - this.grab.dx, DESIGN.floatWidth, this.el.offsetWidth, room.width, room.margin);
		const transform = `translate3d(${left}px, ${y - this.grab.dy}px, 0)`;
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

	/** Slides into the rect, taking its size, and fades as it goes. */
	sink(rect: DOMRect): Promise<void> {
		this.el.classList.add("is-sinking", "is-gone");
		return this.flyTo(rect);
	}

	async vanish(): Promise<void> {
		for (const layer of this.stack) layer.classList.add("is-gone");
		this.count?.classList.add("is-gone");
		this.el.classList.add("is-flying");
		void this.el.offsetWidth;
		this.el.classList.add("is-gone");
		await new Promise((resolve) => window.setTimeout(resolve, tokenMs(this.el, DURATION.fly) + SETTLE_MS));
	}

	remove(): void {
		for (const layer of this.stack) layer.remove();
		this.count?.remove();
		this.el.remove();
	}
}

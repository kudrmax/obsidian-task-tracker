import { DURATION, tokenMs } from "../design";
import { roundShape } from "../kit/Button";
import type { Grab } from "./FloatingCard";
import type { Float } from "./DropTarget";

const SETTLE_MS = 20;

/** The plus itself under the finger while a new task is carried: let go on a place it shrinks into the line's dot. */
export class PlusFloat implements Float {
	private readonly el: HTMLElement;

	constructor(private readonly grab: Grab) {
		this.el = roundShape(document.body, "plus", "accent", "tc-float-plus");
	}

	moveTo(x: number, y: number): void {
		this.el.style.transform = `translate3d(${x - this.grab.dx}px, ${y - this.grab.dy}px, 0)`;
	}

	/** Its centre goes to the left end of `rect`'s middle, where the line starts, and it shrinks away there. */
	land(rect: DOMRect): Promise<void> {
		const half = this.el.offsetWidth / 2;
		return this.fly(`translate3d(${rect.left - half}px, ${rect.top + rect.height / 2 - half}px, 0) scale(0)`);
	}

	/** Back into the plus's place, its size kept. */
	flyTo(rect: DOMRect): Promise<void> {
		return this.fly(`translate3d(${rect.left}px, ${rect.top}px, 0)`);
	}

	remove(): void {
		this.el.remove();
	}

	private async fly(transform: string): Promise<void> {
		this.el.classList.add("is-flying");
		void this.el.offsetWidth;
		this.el.style.transform = transform;
		await new Promise((resolve) => window.setTimeout(resolve, tokenMs(this.el, DURATION.fly) + SETTLE_MS));
	}
}

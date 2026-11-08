import { DURATION, tokenMs } from "../design";
import { roundShape } from "../kit/Button";
import type { Grab } from "./FloatingCard";
import type { Float } from "./DropTarget";

const SETTLE_MS = 20;

/** The plus itself under the finger while a new task is carried: let go on a place it lands in the field opened there and fades. */
export class PlusFloat implements Float {
	private readonly el: HTMLElement;

	constructor(private readonly grab: Grab) {
		this.el = roundShape(activeDocument.body, "plus", "accent", "tc-float-plus");
	}

	moveTo(x: number, y: number): void {
		this.el.style.transform = `translate3d(${x - this.grab.dx}px, ${y - this.grab.dy}px, 0)`;
	}

	/** It goes to the start of `rect` (the field opened where it was let go), as tall as the field, and fades there. */
	land(rect: DOMRect): Promise<void> {
		const size = this.el.offsetWidth || 1;
		const scale = Math.min(1, rect.height / size);
		return this.fly(`translate3d(${rect.left}px, ${rect.top + rect.height / 2 - (size * scale) / 2}px, 0) scale(${scale})`, true);
	}

	/** Back into the plus's place, its size kept. */
	flyTo(rect: DOMRect): Promise<void> {
		return this.fly(`translate3d(${rect.left}px, ${rect.top}px, 0)`);
	}

	/** Fades away where it is. */
	vanish(): Promise<void> {
		return this.fly(this.el.style.transform, true);
	}

	remove(): void {
		this.el.remove();
	}

	private async fly(transform: string, fade = false): Promise<void> {
		this.el.classList.add("is-flying");
		void this.el.offsetWidth;
		this.el.style.transform = transform;
		this.el.classList.toggle("is-gone", fade);
		await new Promise((resolve) => window.setTimeout(resolve, tokenMs(this.el, DURATION.fly) + SETTLE_MS));
	}
}

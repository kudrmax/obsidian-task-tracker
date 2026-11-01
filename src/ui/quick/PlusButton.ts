import { LAYOUT } from "../design";
import { capturePointer, el, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import { icon } from "../icons";

export interface PlusButtonDeps {
	onTap(): void;
	/** The finger left the plus: the drag of a new task takes the pointer from this move on. */
	onDrag(e: PointerEvent, source: HTMLElement): void;
	readonly arbiter: GestureArbiter;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	readonly y: number;
}

/**
 * The round button beside the column switch. A tap opens the typing field; a finger that moves past the press tolerance
 * hands the gesture over to the drag of a new task, at once: there is no long press.
 */
export class PlusButton {
	private readonly button: HTMLElement;
	private press: Press | null = null;
	private isHidden = false;

	constructor(parent: HTMLElement, private readonly deps: PlusButtonDeps) {
		this.button = el(parent, "button", "tc-plus");
		this.button.setAttribute("aria-label", "New task");
		this.button.appendChild(icon("plus"));
		this.button.addEventListener("pointerdown", (e) => this.down(e));
		this.button.addEventListener("pointermove", (e) => this.move(e));
		this.button.addEventListener("pointerup", (e) => this.up(e));
		this.button.addEventListener("pointercancel", (e) => this.cancel(e));
		this.button.addEventListener("click", (e) => {
			if (e.detail === 0 && !this.isHidden) this.deps.onTap();
		});
	}

	set hidden(value: boolean) {
		this.isHidden = value;
		this.button.classList.toggle("is-hidden", value);
		if (value) this.end();
	}

	private down(e: PointerEvent): void {
		if (this.isHidden || this.press || !e.isPrimary || e.button !== 0 || this.deps.arbiter.busy) return;
		this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
		capturePointer(this.button, e.pointerId);
		if (e.pointerType === "mouse") e.preventDefault();
	}

	private moved(e: PointerEvent): boolean {
		return Math.hypot(e.clientX - this.press!.x, e.clientY - this.press!.y) > LAYOUT.pressTolerance;
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId || !this.moved(e)) return;
		this.end();
		this.deps.onDrag(e, this.button);
	}

	private up(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		this.end();
		this.deps.onTap();
	}

	private cancel(e: PointerEvent): void {
		if (this.press && e.pointerId === this.press.pointerId) this.end();
	}

	private end(): void {
		if (!this.press) return;
		releasePointer(this.button, this.press.pointerId);
		this.press = null;
	}
}

import type { EntryPart } from "./EntryPart";
import { LAYOUT } from "../design";
import { capturePointer, releasePointer } from "../dom";
import type { GestureArbiter } from "../gestures";
import { Button } from "../kit/Button";

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
export class PlusButton implements EntryPart {
	private readonly plus: Button;
	private press: Press | null = null;
	private isHidden = false;

	constructor(parent: HTMLElement, private readonly deps: PlusButtonDeps) {
		this.plus = Button.create(parent, {
			kind: "round",
			tone: "accent",
			label: "New task",
			icon: "plus",
			cls: "tc-plus",
			onPress: (e) => {
				if (e.detail === 0 && !this.isHidden) this.deps.onTap();
			},
		});
		const button = this.plus.el;
		button.addEventListener("pointerdown", (e) => this.down(e));
		button.addEventListener("pointermove", (e) => this.move(e));
		button.addEventListener("pointerup", (e) => this.up(e));
		button.addEventListener("pointercancel", (e) => this.cancel(e));
	}

	owns(target: Element): boolean {
		return this.plus.el.contains(target);
	}

	set hidden(value: boolean) {
		this.isHidden = value;
		this.plus.setHidden(value);
		if (value) this.end();
	}

	private down(e: PointerEvent): void {
		if (this.isHidden || this.press || !e.isPrimary || e.button !== 0 || this.deps.arbiter.busy) return;
		this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
		capturePointer(this.plus.el, e.pointerId);
		if (e.pointerType === "mouse") e.preventDefault();
	}

	private moved(e: PointerEvent): boolean {
		return Math.hypot(e.clientX - this.press!.x, e.clientY - this.press!.y) > LAYOUT.pressTolerance;
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId || !this.moved(e)) return;
		this.end();
		this.deps.onDrag(e, this.plus.el);
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
		releasePointer(this.plus.el, this.press.pointerId);
		this.press = null;
	}
}

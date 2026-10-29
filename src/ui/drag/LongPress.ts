import { LAYOUT } from "../design";
import { capturePointer, releasePointer } from "../dom";

export interface LongPressOptions {
	delayMs(): number;
	/** Another gesture owns the screen: nothing starts. */
	busy(): boolean;
	/** The press became a drag: a finger held still for the delay, or a mouse moved. */
	onStart(e: PointerEvent): void;
	/** Released before anything started. */
	onTap?(e: PointerEvent): void;
	/** A mouse held still for the delay. */
	onLongTap?(e: PointerEvent): void;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	readonly y: number;
	readonly mouse: boolean;
	timer: number | null;
	last: PointerEvent;
}

/** How a press on a card or a block turns into a drag: a finger waits out the delay without wandering; a mouse just moves. */
export class LongPress {
	private press: Press | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly opts: LongPressOptions,
	) {
		el.addEventListener("pointerdown", (e) => this.down(e));
		el.addEventListener("pointermove", (e) => this.move(e));
		el.addEventListener("pointerup", (e) => this.up(e));
		el.addEventListener("pointercancel", (e) => this.cancel(e));
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0 || this.press || this.opts.busy()) return;
		const press: Press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse", timer: null, last: e };
		press.timer = window.setTimeout(() => this.fire(press), this.opts.delayMs());
		this.press = press;
		capturePointer(this.el, e.pointerId);
		if (press.mouse) e.preventDefault();
	}

	private distance(e: PointerEvent): number {
		return Math.hypot(e.clientX - this.press!.x, e.clientY - this.press!.y);
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		this.press.last = e;
		const distance = this.distance(e);
		if (this.press.mouse) {
			if (distance > LAYOUT.dragStartDistance) {
				this.end();
				this.opts.onStart(e);
			}
		} else if (distance > LAYOUT.pressTolerance) this.end();
	}

	private up(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const moved = this.distance(e) > LAYOUT.pressTolerance;
		this.end();
		if (!moved) this.opts.onTap?.(e);
	}

	private cancel(e: PointerEvent): void {
		if (this.press && e.pointerId === this.press.pointerId) this.end();
	}

	private fire(press: Press): void {
		if (this.press !== press) return;
		const e = press.last;
		this.end();
		if (this.opts.busy()) return;
		if (press.mouse) this.opts.onLongTap?.(e);
		else this.opts.onStart(e);
	}

	private end(): void {
		if (!this.press) return;
		if (this.press.timer !== null) window.clearTimeout(this.press.timer);
		releasePointer(this.el, this.press.pointerId);
		this.press = null;
	}
}

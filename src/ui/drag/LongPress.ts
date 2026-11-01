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
	/** A mouse clicked twice quickly: the first click then reports no tap. */
	onDoubleTap?(e: PointerEvent): void;
	/** A mouse held still for the delay. */
	onLongTap?(e: PointerEvent): void;
	/** Whether this press is for this element at all: a press that starts on a child with gestures of its own is not. */
	accepts?(e: PointerEvent): boolean;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	readonly y: number;
	readonly mouse: boolean;
	timer: number | null;
	last: PointerEvent;
	/** The second press of a double click. */
	readonly second: boolean;
}

/** How a press on a card or a block turns into a drag: a finger waits out the delay without wandering; a mouse just moves. */
export class LongPress {
	private press: Press | null = null;
	/** A mouse click waiting to see whether a second one makes it a double click. */
	private pendingTap: number | null = null;

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
		if (this.opts.accepts && !this.opts.accepts(e)) return;
		const second = this.pendingTap !== null;
		this.dropPendingTap();
		const press: Press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse", timer: null, last: e, second };
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
		const { mouse, second } = this.press;
		this.end();
		if (moved) return;
		if (!mouse || !this.opts.onDoubleTap) this.opts.onTap?.(e);
		else if (second) this.opts.onDoubleTap(e);
		else this.pendingTap = window.setTimeout(() => {
			this.pendingTap = null;
			this.opts.onTap?.(e);
		}, LAYOUT.doubleClickMs);
	}

	private dropPendingTap(): void {
		if (this.pendingTap !== null) window.clearTimeout(this.pendingTap);
		this.pendingTap = null;
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

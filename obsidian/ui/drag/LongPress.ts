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
	/** Whether this press is for this element at all: a press that starts on a child with gestures of its own is not. */
	accepts?(e: PointerEvent): boolean;
	/**
	 * The element is drawn again or leaves: it hears no more from these options. Drawn again, the same element takes the
	 * new ones through `attach` and a press already under way goes on with them, so a redraw never drops a finger.
	 */
	readonly signal?: AbortSignal;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	readonly y: number;
	readonly mouse: boolean;
	timer: number | null;
	last: PointerEvent;
}

/**
 * How a press on a card or a block turns into a drag: a finger waits out the delay without wandering; a mouse just moves.
 * A second finger anywhere makes the press part of a pinch: it is forgotten, so lifting it is no tap.
 */
export class LongPress {
	private static readonly attached = new WeakMap<HTMLElement, LongPress>();

	/**
	 * The press of `el` with `opts`: the one it already has, now with these options, when the element was drawn again
	 * (a row kept from drawing to drawing); a press under way goes on through the redraw.
	 */
	static attach(el: HTMLElement, opts: LongPressOptions): LongPress {
		const kept = LongPress.attached.get(el);
		if (!kept) return new LongPress(el, opts);
		kept.listen(opts);
		return kept;
	}

	private press: Press | null = null;
	private readonly otherFinger = (e: PointerEvent) => {
		if (this.press && e.pointerId !== this.press.pointerId) this.end();
	};

	private opts!: LongPressOptions;

	constructor(
		private readonly el: HTMLElement,
		opts: LongPressOptions,
	) {
		LongPress.attached.set(el, this);
		el.addEventListener("pointerdown", (e) => this.down(e));
		el.addEventListener("pointermove", (e) => this.move(e));
		el.addEventListener("pointerup", (e) => this.up(e));
		el.addEventListener("pointercancel", (e) => this.cancel(e));
		this.listen(opts);
	}

	/** Hears with `opts` until their signal ends them; ended and not taken up again in the same drawing, the press ends. */
	private listen(opts: LongPressOptions): void {
		this.opts = opts;
		const signal = opts.signal;
		signal?.addEventListener("abort", () =>
			queueMicrotask(() => {
				if (this.opts === opts) this.end();
			}),
		);
	}

	/** Its options were called off and none came after: the element left, or its gestures were taken away. */
	private get deaf(): boolean {
		return this.opts.signal?.aborted === true;
	}

	private down(e: PointerEvent): void {
		if (this.deaf || !e.isPrimary || e.button !== 0 || this.press || this.opts.busy()) return;
		if (this.opts.accepts && !this.opts.accepts(e)) return;
		const press: Press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse", timer: null, last: e };
		press.timer = window.setTimeout(() => this.fire(press), this.opts.delayMs());
		this.press = press;
		this.el.ownerDocument.addEventListener("pointerdown", this.otherFinger, true);
		capturePointer(this.el, e.pointerId);
		if (press.mouse) e.preventDefault();
	}

	private distance(e: PointerEvent): number {
		return Math.hypot(e.clientX - this.press!.x, e.clientY - this.press!.y);
	}

	private move(e: PointerEvent): void {
		if (this.deaf || !this.press || e.pointerId !== this.press.pointerId) return;
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
		if (!moved && !this.opts.busy()) this.opts.onTap?.(e);
	}

	private cancel(e: PointerEvent): void {
		if (this.press && e.pointerId === this.press.pointerId) this.end();
	}

	/** A redraw may have taken the element away while the finger held it: nothing starts from a card no longer on the page. */
	private fire(press: Press): void {
		if (this.press !== press) return;
		const e = press.last;
		this.end();
		if (!this.el.isConnected || this.opts.busy()) return;
		if (press.mouse) this.opts.onLongTap?.(e);
		else this.opts.onStart(e);
	}

	private end(): void {
		if (!this.press) return;
		if (this.press.timer !== null) window.clearTimeout(this.press.timer);
		this.el.ownerDocument.removeEventListener("pointerdown", this.otherFinger, true);
		releasePointer(this.el, this.press.pointerId);
		this.press = null;
	}
}

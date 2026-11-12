import { dividerAt, type DividerStop } from "../../core/application/contracts";
import { capturePointer, el, releasePointer } from "./dom";
import type { GestureArbiter } from "./gestures";
import { PointerSpeed } from "./PointerSpeed";
import { SnapGlide } from "./motion/SnapGlide";

export interface DividerOptions {
	width(): number;
	onWidth(width: number): void;
	onRelease(width: number): void;
	/** The least width; a function where it changes with the view's mode. */
	min: number | (() => number);
	max(): number;
	/** The width that puts the line in the middle of the window. */
	center(): number;
	onSnap(): void;
	readonly arbiter: GestureArbiter;
}

const RESIZE = "divider";

interface Press {
	readonly x: number;
	readonly width: number;
	readonly pointerId: number;
	readonly speed: PointerSpeed;
	snapped: boolean;
}

/** The strip between the columns: dragging it, or its handle, sets the list's width; brought slowly near the middle, it holds to it. The drag holds the screen. */
export class Divider {
	private press: Press | null = null;
	/** The width shown: the step into the middle and out of it glides. */
	private readonly glide: SnapGlide;

	private readonly el: HTMLElement;

	constructor(
		host: HTMLElement,
		private readonly opts: DividerOptions,
	) {
		this.el = host;
		this.el.classList.add("tc-divider");
		this.glide = new SnapGlide(host, (width) => opts.onWidth(width));
		el(this.el, "div", "tc-divider-line");
		const handle = el(this.el, "span", "tc-divider-handle");
		handle.setAttribute("role", "separator");
		handle.setAttribute("aria-orientation", "vertical");
		handle.setAttribute("aria-label", "Resize columns");
		this.el.addEventListener("pointerdown", (e) => this.down(e));
		this.el.addEventListener("pointermove", (e) => this.move(e));
		this.el.addEventListener("pointerup", (e) => this.up(e));
		this.el.addEventListener("pointercancel", (e) => this.up(e));
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0 || !this.opts.arbiter.claim(RESIZE)) return;
		const width = this.opts.width();
		const speed = new PointerSpeed(e.clientX, e.timeStamp);
		this.press = { x: e.clientX, width, pointerId: e.pointerId, speed, snapped: width === this.opts.center() };
		this.glide.reset();
		capturePointer(this.el, e.pointerId);
		e.preventDefault();
	}

	/** Where the line goes for this event, and whether it holds to the middle there: the core's `dividerAt`. */
	private place(e: PointerEvent): DividerStop {
		const press = this.press!;
		press.speed.update(e.clientX, e.timeStamp);
		const wanted = press.width + e.clientX - press.x;
		return dividerAt(wanted, { width: wanted, min: typeof this.opts.min === "number" ? this.opts.min : this.opts.min(), max: this.opts.max(), center: this.opts.center() }, press.speed.value);
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const { width, snapped } = this.place(e);
		if (snapped && !this.press.snapped) this.opts.onSnap();
		const stepped = snapped !== this.press.snapped;
		this.press.snapped = snapped;
		this.glide.set(width, stepped);
	}

	private up(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const press = this.press;
		const { width, snapped } = this.place(e);
		releasePointer(this.el, e.pointerId);
		this.press = null;
		this.glide.set(width, snapped !== press.snapped);
		this.glide.whenSettled(() => {
			this.opts.arbiter.release(RESIZE);
			this.opts.onRelease(width);
		});
	}
}

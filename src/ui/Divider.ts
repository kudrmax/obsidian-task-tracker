import { capturePointer, el as make, releasePointer } from "./dom";

export interface DividerOptions {
	width(): number;
	onWidth(width: number): void;
	onRelease(width: number): void;
	min: number;
	max: number;
}

/** The strip between the columns: dragging it, or its handle, sets the list's width. */
export class Divider {
	private press: { readonly x: number; readonly width: number; readonly pointerId: number } | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly opts: DividerOptions,
	) {
		el.classList.add("tc-divider");
		make(el, "div", "tc-divider-line");
		const handle = make(el, "button", "tc-divider-handle");
		handle.setAttribute("aria-label", "Resize columns");
		el.addEventListener("pointerdown", (e) => this.down(e));
		el.addEventListener("pointermove", (e) => this.move(e));
		el.addEventListener("pointerup", (e) => this.up(e));
		el.addEventListener("pointercancel", (e) => this.up(e));
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0) return;
		this.press = { x: e.clientX, width: this.opts.width(), pointerId: e.pointerId };
		capturePointer(this.el, e.pointerId);
		e.preventDefault();
	}

	private widthFor(e: PointerEvent): number {
		const wanted = this.press!.width + e.clientX - this.press!.x;
		return Math.round(Math.min(this.opts.max, Math.max(this.opts.min, wanted)));
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		this.opts.onWidth(this.widthFor(e));
	}

	private up(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const width = this.widthFor(e);
		releasePointer(this.el, e.pointerId);
		this.press = null;
		this.opts.onWidth(width);
		this.opts.onRelease(width);
	}
}

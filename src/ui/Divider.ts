import { LAYOUT } from "./design";
import { capturePointer, el as make, releasePointer } from "./dom";

export interface DividerOptions {
	width(): number;
	onWidth(width: number): void;
	onRelease(width: number): void;
	min: number;
	max(): number;
	/** The width that puts the line in the middle of the window. */
	center(): number;
	onSnap(): void;
}

/** The strip between the columns: dragging it, or its handle, sets the list's width; near the middle it holds to it. */
export class Divider {
	private press: { readonly x: number; readonly width: number; readonly pointerId: number; snapped: boolean } | null = null;

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
		this.press = { x: e.clientX, width: this.opts.width(), pointerId: e.pointerId, snapped: false };
		capturePointer(this.el, e.pointerId);
		e.preventDefault();
	}

	private widthFor(e: PointerEvent): number {
		const wanted = this.press!.width + e.clientX - this.press!.x;
		const width = this.snaps(wanted) ? this.opts.center() : Math.round(wanted);
		return Math.min(this.opts.max(), Math.max(this.opts.min, width));
	}

	private snaps(width: number): boolean {
		return Math.abs(width - this.opts.center()) <= LAYOUT.dividerSnapDistance;
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const width = this.widthFor(e);
		const snapped = width === this.opts.center();
		if (snapped && !this.press.snapped) this.opts.onSnap();
		this.press.snapped = snapped;
		this.opts.onWidth(width);
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

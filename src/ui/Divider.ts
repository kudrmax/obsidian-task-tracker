import { LAYOUT } from "./design";
import { capturePointer, el as make, releasePointer } from "./dom";
import { PointerSpeed } from "./PointerSpeed";

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

interface Press {
	readonly x: number;
	readonly width: number;
	readonly pointerId: number;
	readonly speed: PointerSpeed;
	snapped: boolean;
}

/** The strip between the columns: dragging it, or its handle, sets the list's width; brought slowly near the middle, it holds to it. */
export class Divider {
	private press: Press | null = null;

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
		const width = this.opts.width();
		const speed = new PointerSpeed(e.clientX, e.timeStamp);
		this.press = { x: e.clientX, width, pointerId: e.pointerId, speed, snapped: width === this.opts.center() };
		capturePointer(this.el, e.pointerId);
		e.preventDefault();
	}

	/** Where the line goes for this event, and whether it holds to the middle there. */
	private place(e: PointerEvent): { width: number; snapped: boolean } {
		const press = this.press!;
		press.speed.update(e.clientX, e.timeStamp);
		const wanted = press.width + e.clientX - press.x;
		const snapped = this.snaps(wanted);
		const width = snapped ? this.opts.center() : Math.round(wanted);
		return { width: Math.min(this.opts.max(), Math.max(this.opts.min, width)), snapped };
	}

	private snaps(width: number): boolean {
		const center = this.opts.center();
		const reachable = center >= this.opts.min && center <= this.opts.max();
		const slow = this.press!.speed.value < LAYOUT.dividerSnapSpeed;
		return reachable && slow && Math.abs(width - center) <= LAYOUT.dividerSnapDistance;
	}

	private move(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const { width, snapped } = this.place(e);
		if (snapped && !this.press.snapped) this.opts.onSnap();
		this.press.snapped = snapped;
		this.opts.onWidth(width);
	}

	private up(e: PointerEvent): void {
		if (!this.press || e.pointerId !== this.press.pointerId) return;
		const { width } = this.place(e);
		releasePointer(this.el, e.pointerId);
		this.press = null;
		this.opts.onWidth(width);
		this.opts.onRelease(width);
	}
}

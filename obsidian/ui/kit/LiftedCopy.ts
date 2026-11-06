import { pinTo, type PinSize } from "../dom";
import type { Overlay } from "../menu/Overlay";

/** A copy of what a window belongs to, over the overlay's blur where that stands; it goes with the overlay. */
export class LiftedCopy {
	rect = new DOMRect();

	/** `copy` is built by its owner: a clone, or drawn anew. On the level it stands at the depth of the window. */
	static over(overlay: Overlay, copy: HTMLElement, onLevel: boolean): LiftedCopy {
		return new LiftedCopy(overlay.add(copy, onLevel));
	}

	private constructor(readonly el: HTMLElement) {}

	pin(rect: DOMRect, size?: PinSize): this {
		this.rect = rect;
		pinTo(this.el, rect, size);
		return this;
	}
}

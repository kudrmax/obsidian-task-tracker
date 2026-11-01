import { PROPERTY } from "./design";
import { px } from "./dom";

/**
 * How Obsidian's desktop status bar, which floats over the view's bottom right corner, reaches into it: how far in from the
 * view's right edge; none when it lies elsewhere. The phone navigation needs no measuring: Obsidian gives the room it keeps
 * for it as a CSS variable, which styles.css reads.
 */
export function statusClear(view: DOMRect, status: DOMRect | null): number {
	if (!status || status.height === 0 || status.width === 0) return 0;
	const covers = status.top < view.bottom && status.bottom > view.top && status.left < view.right && status.right > view.left;
	return covers ? Math.max(0, view.right - status.left) : 0;
}

const STATUS_BAR = ".status-bar";

/** Keeps what the view pins to its bottom right corner clear of Obsidian's desktop status bar. */
export class ChromeClearance {
	constructor(private readonly view: HTMLElement) {}

	measure(): void {
		const status = document.querySelector(STATUS_BAR)?.getBoundingClientRect() ?? null;
		this.view.style.setProperty(PROPERTY.statusClear, px(statusClear(this.view.getBoundingClientRect(), status)));
	}
}

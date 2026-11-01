import { PROPERTY } from "./design";
import { px } from "./dom";

/** How Obsidian's own chrome that floats over the view reaches into it, so what the view pins to its bottom stays clear. */

/** The phone navigation: how far up from the view's bottom its top reaches; none while it is hidden. */
export function navigationClear(view: DOMRect, navigation: DOMRect | null): number {
	if (!navigation || navigation.height === 0) return 0;
	return Math.max(0, view.bottom - navigation.top);
}

/** The desktop status bar in the bottom right corner: how far in from the view's right edge it reaches; none when it lies elsewhere. */
export function statusClear(view: DOMRect, status: DOMRect | null): number {
	if (!status || status.height === 0 || status.width === 0) return 0;
	const covers = status.top < view.bottom && status.bottom > view.top && status.left < view.right && status.right > view.left;
	return covers ? Math.max(0, view.right - status.left) : 0;
}

const NAVIGATION = ".mobile-navbar";
const STATUS_BAR = ".status-bar";

/**
 * Keeps what the view pins to its bottom clear of Obsidian's chrome. The phone navigation slides away and back, under the
 * keyboard and when Obsidian hides it, without resizing the view: a resize can land while it is still on its way, so each
 * of its moves is measured again once it has ended.
 */
export class ChromeClearance {
	constructor(private readonly view: HTMLElement) {}

	/** Measures again each time the navigation ends a move; `listen` registers a document listener for the view's lifetime. */
	follow(listen: (type: "transitionend", handler: (e: Event) => void) => void): void {
		listen("transitionend", (e) => {
			if (e.target instanceof Element && e.target.matches(NAVIGATION)) this.measure();
		});
	}

	measure(): void {
		const root = this.view.getBoundingClientRect();
		const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
		this.view.style.setProperty(PROPERTY.navClear, px(navigationClear(root, box(NAVIGATION))));
		this.view.style.setProperty(PROPERTY.statusClear, px(statusClear(root, box(STATUS_BAR))));
	}
}

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

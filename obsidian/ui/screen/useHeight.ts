import { useCallback, useEffect, useState } from "react";

/**
 * The content height of the element the returned ref is put on, followed with a ResizeObserver: the room the rows share
 * (`stackedLists` needs it, and nothing else knows it: Obsidian's phone navigation and status bar take their own part).
 * The observer belongs to the element's own window, a pop-out's too.
 */
export function useHeight(): [(el: HTMLElement | null) => void, number] {
	const [el, setEl] = useState<HTMLElement | null>(null);
	const [height, setHeight] = useState(0);
	useEffect(() => {
		const view = el?.ownerDocument.defaultView;
		if (!el || !view) return;
		const observer = new view.ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height)));
		observer.observe(el);
		return () => observer.disconnect();
	}, [el]);
	return [useCallback((node: HTMLElement | null) => setEl(node), []), height];
}

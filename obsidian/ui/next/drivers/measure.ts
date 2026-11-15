/**
 * The measure driver (§Architecture): every observer, and the sizes only the browser knows. Each watch tells at most
 * once a frame and stops with `dispose`.
 */
export class Measure {
	private readonly stops = new Set<() => void>();

	/**
	 * A page watched for any change of its own (a note's view: its mode switched, the reading view drawn again, the
	 * editor's content replaced), what changes inside `own` left out: `changed` once a frame.
	 */
	watchPage(page: HTMLElement, own: () => Node | null, changed: () => void): () => void {
		const view = page.ownerDocument.defaultView;
		if (!view) return () => undefined;
		let frame = 0;
		const observer = new view.MutationObserver((records) => {
			const mine = own();
			if (!records.some((record) => !(mine && mine.contains(record.target)))) return;
			if (frame) return;
			frame = view.requestAnimationFrame(() => {
				frame = 0;
				changed();
			});
		});
		observer.observe(page, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
		const stop = () => {
			observer.disconnect();
			if (frame) view.cancelAnimationFrame(frame);
			frame = 0;
			this.stops.delete(stop);
		};
		this.stops.add(stop);
		return stop;
	}

	/**
	 * Where the row of `key` inside `root` would show whole: the nearest of its ancestors that scrolls, and the top it
	 * scrolls to (the least move: up to the row's top, or down until its bottom shows); null when it shows whole already.
	 */
	static toShow(root: ParentNode, key: string): { readonly scroller: HTMLElement; readonly top: number } | null {
		let row: HTMLElement | null = null;
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-key]")) if (el.dataset.nKey === key) row = el;
		let scroller = row?.parentElement ?? null;
		while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) scroller = scroller.parentElement;
		if (!row || !scroller || !root.contains(scroller)) return null;
		const box = scroller.getBoundingClientRect();
		const rect = row.getBoundingClientRect();
		if (rect.top < box.top) return { scroller, top: scroller.scrollTop - (box.top - rect.top) };
		if (rect.bottom > box.bottom) return { scroller, top: scroller.scrollTop + Math.min(rect.bottom - box.bottom, rect.top - box.top) };
		return null;
	}

	dispose(): void {
		[...this.stops].forEach((stop) => stop());
	}
}

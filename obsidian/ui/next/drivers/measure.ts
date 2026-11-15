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

	dispose(): void {
		[...this.stops].forEach((stop) => stop());
	}
}

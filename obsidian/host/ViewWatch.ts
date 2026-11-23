/**
 * A note's view watched for any change of its own page: a mode switched (by a button, a command or `setState`), the
 * reading view drawn again, the editor's content replaced. What changes inside the block itself is left out. It tells
 * once a frame, so a burst of typing costs one look.
 */
export class ViewWatch {
	private readonly watch: MutationObserver;
	private frame = 0;

	constructor(
		private readonly page: HTMLElement,
		private readonly own: () => HTMLElement,
		private readonly changed: () => void,
	) {
		const view = page.ownerDocument.defaultView ?? window;
		this.watch = new view.MutationObserver((records) => {
			const block = this.own();
			if (records.some((record) => !block.contains(record.target))) this.request();
		});
	}

	start(): void {
		this.watch.observe(this.page, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
	}

	stop(): void {
		this.watch.disconnect();
		if (this.frame) this.window().cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	private request(): void {
		if (this.frame) return;
		this.frame = this.window().requestAnimationFrame(() => {
			this.frame = 0;
			this.changed();
		});
	}

	private window(): Window {
		return this.page.ownerDocument.defaultView ?? window;
	}
}

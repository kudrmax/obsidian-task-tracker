/**
 * A note's block as tall as its rows need (board D5): the whole list of the view shown, its bottom row under it, so the
 * note scrolls and not the block; past the CSS's tallest the list scrolls inside. It fits again once a frame after its
 * screen changed (cards, a field opened), never while a finger drags a card: the list under it would move away.
 */
export class BlockHeight {
	private readonly watch: MutationObserver;
	private readonly sized: ResizeObserver;
	private frame = 0;

	constructor(
		private readonly block: HTMLElement,
		private readonly root: HTMLElement,
		/** What scrolls the view the block shows: its layout's stack or list. */
		private readonly scroller: () => HTMLElement | null,
	) {
		const view = root.ownerDocument.defaultView ?? window;
		this.watch = new view.MutationObserver(() => this.request());
		this.sized = new view.ResizeObserver(() => this.request());
	}

	start(): void {
		this.watch.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
		this.sized.observe(this.root);
		this.request();
	}

	stop(): void {
		this.watch.disconnect();
		this.sized.disconnect();
		if (this.frame) (this.root.ownerDocument.defaultView ?? window).cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	private request(): void {
		if (this.frame) return;
		this.frame = (this.root.ownerDocument.defaultView ?? window).requestAnimationFrame(() => {
			this.frame = 0;
			this.fit();
		});
	}

	fit(): void {
		if (this.root.classList.contains("is-dragging") || !this.root.isConnected) return;
		const scroller = this.scroller();
		if (!scroller) return;
		const over = scroller.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
		const frame = this.block.offsetHeight - this.root.offsetHeight;
		const height = `${Math.ceil(over + scroller.scrollHeight + frame)}px`;
		if (this.block.style.height !== height) this.block.style.height = height;
	}
}

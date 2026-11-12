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
		const height = `${Math.ceil(over + contentHeight(scroller) + frame)}px`;
		if (this.block.style.height !== height) this.block.style.height = height;
	}
}

/**
 * How tall what `scroller` holds is: its last row's end and its padding. Not its `scrollHeight`, which never reads less
 * than the scroller's own height, so a block that held a taller view (rows, then by project) would never shrink.
 */
function contentHeight(scroller: HTMLElement): number {
	const box = scroller.getBoundingClientRect();
	const style = getComputedStyle(scroller);
	let end = parseFloat(style.paddingTop) || 0;
	for (const child of scroller.children) {
		if (!(child instanceof HTMLElement) || getComputedStyle(child).position === "absolute") continue;
		const rect = child.getBoundingClientRect();
		if (rect.height === 0 && rect.width === 0) continue;
		end = Math.max(end, rect.bottom - box.top + scroller.scrollTop + (parseFloat(getComputedStyle(child).marginBottom) || 0));
	}
	return end + (parseFloat(style.paddingBottom) || 0);
}

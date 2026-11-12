/**
 * A note's block as tall as its rows need (board D5): the whole list of the view shown, its bottom row under it, so the
 * note scrolls and not the block; past the CSS's tallest the list scrolls inside. It fits again once a frame after its
 * screen changed (cards, a field opened) and while the scroller's rows change their heights (cards leaving or arriving),
 * so it shrinks as well as grows with them; never while a finger drags a card: the list under it would move away.
 */
export class BlockHeight {
	private readonly watch: MutationObserver;
	private readonly sized: ResizeObserver;
	private frame = 0;
	/** The scroller's rows whose heights are watched: each watched once, so a fit starts no new round of its own. */
	private watched = new Set<Element>();

	constructor(
		private readonly block: HTMLElement,
		private readonly root: HTMLElement,
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
		this.watched.clear();
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

	/** The scroller of the mode shown: the rows, or the by project list. */
	private scroller(): HTMLElement | null {
		return this.root.querySelector<HTMLElement>(":scope.is-view-rows > .tc-rows .tc-rows-stack, :scope.is-view-by-project > .tc-by-project .tc-list");
	}

	fit(): void {
		if (this.root.classList.contains("is-dragging") || !this.root.isConnected) return;
		const scroller = this.scroller();
		if (!scroller) return;
		const over = scroller.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
		const frame = this.block.offsetHeight - this.root.offsetHeight;
		this.watchRows(scroller);
		const height = `${Math.ceil(over + this.contentHeight(scroller) + frame)}px`;
		if (this.block.style.height !== height) this.block.style.height = height;
	}

	/** What the scroller's rows take, from its top to its last row's foot and its padding: not its box, which fills the block and never shrinks. */
	private contentHeight(scroller: HTMLElement): number {
		const rows = this.rowsOf(scroller);
		const last = rows[rows.length - 1];
		if (!last) return scroller.scrollHeight;
		const style = getComputedStyle(scroller);
		const foot = last.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(last).marginBottom) || 0);
		return foot - scroller.getBoundingClientRect().top + scroller.scrollTop + (parseFloat(style.paddingBottom) || 0);
	}

	/** The rows in the scroller's flow: drawn, and not laid over it. */
	private rowsOf(scroller: HTMLElement): HTMLElement[] {
		return [...scroller.children].filter((row): row is HTMLElement => {
			if (!(row instanceof HTMLElement) || row.getClientRects().length === 0) return false;
			const position = getComputedStyle(row).position;
			return position !== "absolute" && position !== "fixed";
		});
	}

	private watchRows(scroller: HTMLElement): void {
		const rows = new Set<Element>(scroller.children);
		for (const row of this.watched) if (!rows.has(row)) this.sized.unobserve(row);
		for (const row of rows) if (!this.watched.has(row)) this.sized.observe(row);
		this.watched = rows;
	}
}

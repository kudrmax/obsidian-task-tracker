/** The block at its tallest: its lists scroll, and Inbox keeps at most half its column. */
const FULL = "is-full";

/** The columns the window shows, by the place the screen marks on its root: Done and Inbox, Inbox and Soon, Soon and the day, the day and the calendar. */
function shownColumns(root: HTMLElement): { readonly lists: readonly string[]; readonly calendar: boolean } {
	const marks = root.classList;
	if (marks.contains("is-done")) return { lists: ["tc-done", "tc-inbox"], calendar: false };
	if (marks.contains("is-inbox")) return { lists: ["tc-inbox", "tc-soon"], calendar: false };
	if (marks.contains("is-lists")) return { lists: ["tc-soon", "tc-left"], calendar: false };
	return { lists: ["tc-left"], calendar: true };
}

/**
 * How tall the screen must be to show a column's whole content: as tall as it is now, plus what its lists hide under
 * their scroll, less the room left empty under its last list. Each list of a block is as tall as its cards, so the two
 * never meet: a column either has room to spare or hides some of its cards.
 */
function columnNeeds(root: HTMLElement, column: HTMLElement): number {
	const lists = [...column.querySelectorAll<HTMLElement>(".tc-list")];
	const last = lists[lists.length - 1];
	if (!last) return 0;
	const hidden = lists.reduce((sum, list) => sum + Math.max(0, list.scrollHeight - list.clientHeight), 0);
	const padBottom = parseFloat((column.ownerDocument.defaultView ?? window).getComputedStyle(column).paddingBottom) || 0;
	const free = Math.max(0, column.getBoundingClientRect().bottom - padBottom - last.getBoundingClientRect().bottom);
	return root.clientHeight + hidden - free;
}

/** The screen's height that shows every card of the columns in the window; the calendar, a whole day, asks for all the room there is. */
export function neededHeight(root: HTMLElement): number {
	const shown = shownColumns(root);
	if (shown.calendar) return Infinity;
	let need = 0;
	for (const name of shown.lists) {
		const column = root.querySelector<HTMLElement>(`:scope > .${name}`);
		if (column) need = Math.max(need, columnNeeds(root, column));
	}
	return need;
}

/**
 * A note's block as tall as what its window shows: the CSS keeps it between the board's height and a phone's screen,
 * and its lists scroll only past that. It fits again once a frame after its screen changed (cards, the wheel, a field
 * opened), never while a finger drags a card: the list under it would move away.
 */
export class BlockHeight {
	private readonly watch: MutationObserver;
	private readonly sized: ResizeObserver;
	private frame = 0;

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
		const need = neededHeight(this.root) + this.block.offsetHeight - this.root.offsetHeight;
		const tallest = parseFloat((this.block.ownerDocument.defaultView ?? window).getComputedStyle(this.block).maxHeight);
		this.block.classList.toggle(FULL, !Number.isFinite(need) || (Number.isFinite(tallest) && need >= tallest));
		const height = Number.isFinite(need) ? `${Math.ceil(need)}px` : "var(--tc-block-max-h)";
		if (this.block.style.height !== height) this.block.style.height = height;
	}
}

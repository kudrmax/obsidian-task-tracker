import { type DropColumn, stackedRows } from "../../core/application/contracts";
import { el, px } from "./dom";

/** One stage of the rows: its label and the place its list is built in. */
export interface FunnelRow {
	readonly column: DropColumn;
	readonly el: HTMLElement;
	readonly label: HTMLElement;
	readonly body: HTMLElement;
}

/**
 * The rows mode's column (boards D2, T3): the funnel's lists stacked in the core's order (`ViewChoice.rows`), each under
 * its small label. Each list is as tall as its cards while all fit; the long ones share what is left and scroll inside
 * (spec decision 17, the core's `stackedRows`, as the app's). In a note's block (`stacks` false) each is as tall as its
 * cards and the block grows.
 */
export class FunnelRows {
	readonly el: HTMLElement;
	private readonly stack: HTMLElement;
	private readonly rows = new Map<DropColumn, FunnelRow>();
	private shown: readonly DropColumn[] = [];
	private readonly sized = new ResizeObserver(() => this.fit());

	constructor(
		parent: HTMLElement,
		columns: readonly DropColumn[],
		private readonly label: (column: DropColumn) => string,
		private readonly stacks: () => boolean,
	) {
		this.el = el(parent, "div", "tc-rows");
		this.stack = el(this.el, "div", "tc-rows-stack");
		this.sized.observe(this.stack);
		for (const column of columns) {
			const row = el(this.stack, "div", "tc-row");
			row.dataset.column = column;
			const label = el(row, "div", "tc-row-label");
			const body = el(row, "div", "tc-row-body");
			this.rows.set(column, { column, el: row, label, body });
		}
	}

	rowOf(column: DropColumn): FunnelRow {
		const row = this.rows.get(column);
		if (!row) throw new Error(`No row for ${column}`);
		return row;
	}

	/** The stages in `order`, none drawn but those, each under its label. */
	render(order: readonly DropColumn[]): void {
		const drawn = [...this.stack.children];
		const inOrder = order.every((column, i) => drawn[i] === this.rowOf(column).el);
		for (const column of order) {
			const row = this.rowOf(column);
			if (!inOrder) this.stack.appendChild(row.el);
			row.el.classList.remove("tc-hidden");
			row.label.textContent = this.label(column);
		}
		for (const [column, row] of this.rows) if (!order.includes(column)) row.el.classList.add("tc-hidden");
		this.shown = order;
		this.fit();
	}

	/** Each row as tall as the core says for what it wants (its label and its list's content) and the room they share. */
	fit(): void {
		const rows = this.shown.map((column) => this.rowOf(column));
		/** Measured as tall as their content: a row still at its last height would read that height back (`scrollHeight` is never less). */
		for (const row of rows) row.el.style.removeProperty("height");
		if (!this.stacks() || rows.length === 0 || this.stack.clientHeight === 0) return;
		const style = getComputedStyle(this.stack);
		const gap = rows.length > 1 ? parseFloat(getComputedStyle(rows[1].el).marginTop) || 0 : 0;
		const room = this.stack.clientHeight - (parseFloat(style.paddingBottom) || 0) - gap * (rows.length - 1);
		const fade = parseFloat(style.getPropertyValue("--tc-scroll-fade")) || 0;
		const lists = rows.map((row) => row.body.firstElementChild as HTMLElement | null);
		const wanted = rows.map((row, i) => row.label.offsetHeight + (lists[i]?.scrollHeight ?? 0));
		const first = lists[0]?.firstElementChild as HTMLElement | null;
		/** The least a row may be: its label, one card whole, and the fade under it that says more is below. */
		const least = (rows[0]?.label.offsetHeight ?? 0) + (first ? first.offsetTop + first.offsetHeight : parseFloat(style.getPropertyValue("--tc-card-h")) || 0) + fade;
		const heights = stackedRows(wanted, room, least);
		rows.forEach((row, i) => (row.el.style.height = px(heights[i] < wanted[i] ? this.wholeCards(row, lists[i], heights[i], fade) : heights[i])));
	}

	/**
	 * A row that scrolls ends right under its last card that shows whole, with the room of the scroll fade below it: the
	 * fade lies over the next card, never over one the list shows.
	 */
	private wholeCards(row: FunnelRow, list: HTMLElement | null, height: number, fade: number): number {
		if (!list) return height;
		const room = height - row.label.offsetHeight - fade;
		let bottom = 0;
		for (const card of list.children) {
			if (!(card instanceof HTMLElement) || card.offsetHeight === 0) continue;
			const end = card.offsetTop + card.offsetHeight;
			if (end > room && bottom > 0) break;
			bottom = end;
		}
		return row.label.offsetHeight + bottom + fade;
	}


	destroy(): void {
		this.sized.disconnect();
	}
}

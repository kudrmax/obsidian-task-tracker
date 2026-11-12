import type { DropColumn } from "../../core/application/contracts";
import { el } from "./dom";

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
 * (spec decision 17, as the app's).
 */
export class FunnelRows {
	readonly el: HTMLElement;
	private readonly stack: HTMLElement;
	private readonly rows = new Map<DropColumn, FunnelRow>();

	constructor(
		parent: HTMLElement,
		columns: readonly DropColumn[],
		private readonly label: (column: DropColumn) => string,
	) {
		this.el = el(parent, "div", "tc-rows");
		this.stack = el(this.el, "div", "tc-rows-stack");
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
	}
}

import { type DropColumn, stackedRows } from "../../core/application/contracts";
import { el, px } from "./dom";
import { motionLeft, readResting, timingOf } from "./motion/Motion";

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
	/** The heights the rows were last fitted to, and the moves taking them there. */
	private fitted: readonly number[] = [];
	private readonly easing = new Map<HTMLElement, Animation>();

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
		for (const column of order) {
			const list = this.rowOf(column).body.firstElementChild;
			if (list) this.sized.observe(list);
		}
		this.fit();
	}

	/**
	 * Each row as tall as the core says for what it wants (its label and its list's content) and the room they share; run
	 * again whenever the room or a list's height changes. While cards leave or arrive, each row goes once, straight, from
	 * where it stands to where it rests when they are done: no row takes room another frees for a moment and gives it back.
	 */
	fit(): void {
		const rows = this.shown.map((column) => this.rowOf(column));
		if (!this.stacks() || rows.length === 0 || this.stack.clientHeight === 0) {
			for (const row of rows) row.el.style.removeProperty("height");
			this.fitted = [];
			return;
		}
		const style = getComputedStyle(this.stack);
		const gap = rows.length > 1 ? parseFloat(getComputedStyle(rows[1].el).marginTop) || 0 : 0;
		const room = this.stack.clientHeight - (parseFloat(style.paddingBottom) || 0) - gap * (rows.length - 1);
		const wanted = readResting(this.stack, () => rows.map((row) => row.label.offsetHeight + (row.body.firstElementChild?.scrollHeight ?? 0)));
		const card = parseFloat(style.getPropertyValue("--tc-card-h")) || 0;
		const least = (rows[0]?.label.offsetHeight ?? 0) + card;
		const heights = stackedRows(wanted, room, least);
		if (heights.length === this.fitted.length && heights.every((height, i) => Math.abs(height - this.fitted[i]) < 0.5)) return;
		this.fitted = heights;
		const left = Math.max(0, ...rows.map((row) => motionLeft(row.body)));
		rows.forEach((row, i) => {
			const from = row.el.getBoundingClientRect().height;
			this.easing.get(row.el)?.cancel();
			this.easing.delete(row.el);
			row.el.style.height = px(heights[i]);
			const timing = timingOf(row.el);
			if (left <= 0 || !timing || Math.abs(from - heights[i]) < 0.5) return;
			this.easing.set(row.el, row.el.animate([{ height: px(from) }, { height: px(heights[i]) }], { duration: left, easing: timing.easing }));
		});
	}

	destroy(): void {
		this.sized.disconnect();
	}
}

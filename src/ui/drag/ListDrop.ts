import { DESIGN } from "../design";
import type { ListEntry, TaskList } from "../TaskList";
import type { DragPayload, DropResult, DropTarget, ListColumn } from "./DropTarget";

/** A list as a place to drop: within its own list the cards step aside at the finger; from elsewhere the card joins the end. */
export class ListDrop implements DropTarget {
	private rects: DOMRect[] | null = null;
	private index = 0;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		private readonly accepts: (drag: DragPayload) => boolean,
	) {}

	private entries(): ListEntry[] {
		return this.list.cards.filter((entry) => !entry.card.classList.contains("is-lifted"));
	}

	hitTest(x: number, y: number, drag: DragPayload): boolean {
		if (!this.accepts(drag)) return false;
		const r = this.area.getBoundingClientRect();
		return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	preview(_x: number, y: number, drag: DragPayload): void {
		const entries = this.entries();
		this.rects ??= entries.map((entry) => entry.card.getBoundingClientRect());
		const reorder = drag.from === this.column;
		this.index = reorder ? this.rects.filter((r) => y > r.top + r.height / 2).length : entries.length;
		entries.forEach((entry, i) => entry.card.classList.toggle("is-shifted", reorder && i >= this.index));
	}

	landing(): DOMRect | null {
		if (!this.rects) return null;
		const at = this.rects[this.index];
		if (at) return at;
		const last = this.rects[this.rects.length - 1];
		if (last) return new DOMRect(last.left, last.bottom + DESIGN.cardGap, last.width, DESIGN.cardHeight);
		const r = this.list.el.getBoundingClientRect();
		return new DOMRect(r.left, r.top, r.width, DESIGN.cardHeight);
	}

	clear(): void {
		for (const entry of this.list.cards) entry.card.classList.remove("is-shifted");
		this.rects = null;
		this.index = 0;
	}

	drop(_x: number, _y: number, drag: DragPayload): DropResult | null {
		if (!this.accepts(drag)) return null;
		const before = drag.from === this.column ? (this.entries()[this.index]?.item.key ?? null) : null;
		return { kind: "listBefore", before, column: this.column };
	}
}

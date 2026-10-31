import type { GroupedList } from "../../application/contracts";
import { shownCardSize } from "../cardSize";
import { type ListGap, listGaps } from "../listGroups";
import type { ListEntry, TaskList } from "../TaskList";
import type { DragPayload, DropResult, DropTarget, ListColumn } from "./DropTarget";

/**
 * A list as a place to drop. A list that shows sections opens a gap at the finger for a card from anywhere, and the
 * card lands in the section of that gap. Otherwise, within its own list the cards step aside at the finger; from
 * elsewhere the card joins the end.
 */
export class ListDrop implements DropTarget {
	private rects: DOMRect[] | null = null;
	private index = 0;
	private gap: ListGap | null = null;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		private readonly accepts: (drag: DragPayload) => boolean,
		/** The list whose sections the column shows; null for the day column on another day. */
		private readonly grouped: () => GroupedList | null = () => null,
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
		if (this.grouped()) {
			this.gap = this.gapAt(y, drag);
			const at = this.gap.at;
			this.list.elements.forEach((node, i) => node.classList.toggle("is-shifted", i >= at && !node.classList.contains("is-lifted")));
			return;
		}
		const entries = this.entries();
		this.rects ??= entries.map((entry) => entry.card.getBoundingClientRect());
		const reorder = drag.from === this.column;
		this.index = reorder ? this.rects.filter((r) => y > r.top + r.height / 2).length : entries.length;
		entries.forEach((entry, i) => entry.card.classList.toggle("is-shifted", reorder && i >= this.index));
	}

	landing(): DOMRect | null {
		if (!this.rects) return null;
		const at = this.gap ? this.rects[this.gap.at] : this.rects[this.index];
		if (at) return new DOMRect(at.left, at.top, at.width, shownCardSize().height);
		const last = this.rects[this.rects.length - 1];
		const card = shownCardSize();
		if (last) return new DOMRect(last.left, last.bottom + card.gap, last.width, card.height);
		const r = this.list.el.getBoundingClientRect();
		return new DOMRect(r.left, r.top, r.width, card.height);
	}

	clear(): void {
		for (const node of this.list.elements) node.classList.remove("is-shifted");
		this.rects = null;
		this.index = 0;
		this.gap = null;
	}

	drop(_x: number, y: number, drag: DragPayload): DropResult | null {
		if (!this.accepts(drag)) return null;
		const list = this.grouped();
		if (list) {
			const { place } = this.gap ?? this.gapAt(y, drag);
			return { kind: "group", list, group: place.group, before: place.before };
		}
		const before = drag.from === this.column ? (this.entries()[this.index]?.item.key ?? null) : null;
		return { kind: "listBefore", before, column: this.column };
	}

	/** The gap whose place on screen is nearest the finger: the top of the element that steps aside for it, or the list's end. */
	private gapAt(y: number, drag: DragPayload): ListGap {
		this.rects ??= this.list.elements.map((node) => node.getBoundingClientRect());
		const rects = this.rects;
		const last = rects[rects.length - 1];
		const top = (at: number) => rects[at]?.top ?? (last ? last.bottom : this.list.el.getBoundingClientRect().top);
		const gaps = listGaps(this.list.groups, this.list.headers, drag.item.key);
		return gaps.reduce((best, gap) => (Math.abs(top(gap.at) - y) < Math.abs(top(best.at) - y) ? gap : best));
	}
}

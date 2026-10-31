import { shownCardSize } from "../cardSize";
import { tokenPx } from "../design";
import { px } from "../dom";
import type { ListEntry, TaskList } from "../TaskList";
import type { DragPayload, DropResult, DropTarget, ListColumn } from "./DropTarget";
import { type ListPlace, type PlacedCard, placeAt, resultOf } from "./listPlace";

const INDENT = "--tc-subtask-indent";

interface Measured {
	readonly entry: ListEntry;
	readonly rect: DOMRect;
}

/**
 * A list as a place to drop. Within its own list the cards step aside at the finger, and a dashed place shows the level
 * the card's left edge picks; over the middle of a card the card goes into it. From elsewhere the card joins the end.
 */
export class ListDrop implements DropTarget {
	private measured: Measured[] | null = null;
	/** What the list shows; a drag in its own list starts with the gap where the card was. */
	private place: ListPlace | null = null;
	private gap: HTMLElement | null = null;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		private readonly accepts: (drag: DragPayload) => boolean,
	) {}

	hitTest(x: number, y: number, drag: DragPayload): boolean {
		if (!this.accepts(drag)) return false;
		const r = this.area.getBoundingClientRect();
		return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	/**
	 * The cards that stay in the list, where they stand once the dragged ones have closed up: measured when the finger comes
	 * over the list, while they may still be closing, from the first card down, so the steps aside do not move the targets.
	 */
	private cards(): Measured[] {
		if (this.measured) return this.measured;
		const top = this.list.cards[0]?.card.getBoundingClientRect().top ?? 0;
		const card = shownCardSize();
		this.measured = this.list.cards
			.filter((entry) => !entry.card.classList.contains("is-lifted"))
			.map((entry, i) => {
				const r = entry.card.getBoundingClientRect();
				return { entry, rect: new DOMRect(r.left, top + i * (card.height + card.gap), r.width, card.height) };
			});
		return this.measured;
	}

	preview(x: number, y: number, drag: DragPayload): void {
		const cards = this.cards();
		const reorder = drag.from === this.column;
		const level = (x - drag.grabX - this.baseLeft()) / this.indent();
		const card = shownCardSize();
		const place: ListPlace = reorder ? placeAt(this.placed(), y, level, card.height + card.gap, this.place ?? this.liftedFrom()) : { kind: "gap", index: cards.length, level: 0 };
		this.place = place;
		cards.forEach(({ entry }, i) => {
			entry.card.classList.toggle("is-shifted", reorder && place.kind === "gap" && i >= place.index);
			entry.card.classList.toggle("is-target", place.kind === "into" && i === place.index);
		});
		this.showGap(reorder && place.kind === "gap" ? this.landing() : null);
	}

	landing(): DOMRect | null {
		if (!this.measured || !this.place) return null;
		const cards = this.measured;
		if (this.place.kind === "into") return cards[this.place.index].rect;
		const card = shownCardSize();
		const at = cards[this.place.index]?.rect;
		const last = cards[cards.length - 1]?.rect;
		if (!last) {
			const r = this.list.el.getBoundingClientRect();
			return new DOMRect(r.left, r.top, r.width, card.height);
		}
		const left = this.baseLeft() + this.place.level * this.indent();
		return new DOMRect(left, at ? at.top : last.bottom + card.gap, last.right - left, card.height);
	}

	clear(): void {
		for (const entry of this.list.cards) entry.card.classList.remove("is-shifted", "is-target");
		this.showGap(null);
		this.measured = null;
		this.place = null;
	}

	drop(_x: number, _y: number, drag: DragPayload): DropResult | null {
		if (!this.accepts(drag)) return null;
		if (drag.from !== this.column) return { kind: "listBefore", before: null, column: this.column };
		if (!this.place) return null;
		const result = resultOf(this.placed(), this.place);
		return result.kind === "task" ? { kind: "listBefore", before: result.before, column: this.column } : { kind: "nest", parent: result.parent, before: result.before };
	}

	/** The gap where the dragged card stood: the cards before it stay above. */
	private liftedFrom(): ListPlace {
		const all = this.list.cards;
		const at = all.findIndex((entry) => entry.card.classList.contains("is-lifted"));
		return at < 0 ? { kind: "gap", index: this.cards().length, level: 0 } : { kind: "gap", index: at, level: all[at].level };
	}

	private placed(): PlacedCard[] {
		return this.cards().map(({ entry, rect }) => ({ key: entry.item.key, level: entry.level, top: rect.top, height: rect.height }));
	}

	private indent(): number {
		return tokenPx(this.list.el, INDENT);
	}

	/** Where a task's card starts: a subtask's stands its levels further in. */
	private baseLeft(): number {
		const first = this.cards()[0];
		return first ? first.rect.left - first.entry.level * this.indent() : this.list.el.getBoundingClientRect().left;
	}

	/** The dashed place the card will land in, over the list. */
	private showGap(rect: DOMRect | null): void {
		if (!rect) {
			this.gap?.remove();
			this.gap = null;
			return;
		}
		if (!this.gap) {
			this.gap = document.createElement("div");
			this.gap.className = "tc-drop-gap";
			document.body.appendChild(this.gap);
		}
		this.gap.style.left = px(rect.left);
		this.gap.style.top = px(rect.top);
		this.gap.style.width = px(rect.width);
	}
}

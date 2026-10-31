import { shownCardSize } from "../cardSize";
import { tokenPx } from "../design";
import { px } from "../dom";
import type { ListEntry, TaskList } from "../TaskList";
import type { ColumnSections, DragPayload, DropResult, DropTarget, ListColumn } from "./DropTarget";
import { type ListPlace, type PlacedCard, type PlacedHead, placeAt, resultOf } from "./listPlace";

const INDENT = "--tc-subtask-indent";

interface Measured {
	readonly entry: ListEntry;
	readonly rect: DOMRect;
}

interface Layout {
	readonly cards: readonly Measured[];
	readonly heads: readonly (PlacedHead & { readonly el: HTMLElement })[];
}

/**
 * A list as a place to drop. The cards step aside at the finger, and a dashed place shows the level the card's left edge
 * picks; over the middle of a card the card goes into it. A list that shows sections takes a card from anywhere this way,
 * into the section of the gap; another list takes a card from elsewhere at its end.
 */
export class ListDrop implements DropTarget {
	/** What the list shows; a drag in its own list starts with the gap where the card was. */
	private place: ListPlace | null = null;
	private gap: HTMLElement | null = null;
	private layout: Layout | null = null;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		private readonly accepts: (drag: DragPayload) => boolean,
		/** Whose sections the column shows; null for a past day's column. */
		private readonly sections: () => ColumnSections | null = () => null,
	) {}

	hitTest(x: number, y: number, drag: DragPayload): boolean {
		if (!this.accepts(drag)) return false;
		const r = this.area.getBoundingClientRect();
		return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	preview(x: number, y: number, drag: DragPayload): void {
		const layout = this.measure();
		if (!this.placesAnywhere(drag)) {
			this.place = { kind: "gap", index: layout.cards.length, level: 0, group: null };
			return;
		}
		const card = shownCardSize();
		const indent = this.indent();
		const level = indent > 0 ? (x - drag.grabX - this.baseLeft()) / indent : 0;
		const heads = this.sections() ? layout.heads : [];
		const place = placeAt(this.placed(), y, level, card.height + card.gap, this.place ?? this.liftedFrom(), heads);
		this.place = place;
		layout.cards.forEach(({ entry }, i) => {
			entry.card.classList.toggle("is-shifted", place.kind === "gap" && i >= place.index);
			entry.card.classList.toggle("is-target", place.kind === "into" && i === place.index);
		});
		for (const head of layout.heads) head.el.classList.toggle("is-shifted", place.kind === "gap" && this.headAfter(head, place, layout.heads));
		this.showGap(place.kind === "gap" ? this.landing() : null);
	}

	landing(): DOMRect | null {
		if (!this.layout || !this.place) return null;
		const { cards, heads } = this.layout;
		const card = shownCardSize();
		if (this.place.kind === "into") return cards[this.place.index].rect;
		const r = this.list.el.getBoundingClientRect();
		const left = this.baseLeft() + this.place.level * this.indent();
		const right = cards[0]?.rect.right ?? r.right;
		const at = cards[this.place.index];
		const prev = cards[this.place.index - 1];
		const group = this.place.group;
		const head = heads.find((h) => h.group === group);
		const top =
			at && at.entry.item.group === group ? at.rect.top
			: prev && prev.entry.item.group === group ? prev.rect.bottom + card.gap
			: head ? head.top + head.height
			: heads[0]?.top ?? prev?.rect.bottom ?? r.top;
		return new DOMRect(left, top, right - left, card.height);
	}

	clear(): void {
		for (const node of this.list.elements) node.classList.remove("is-shifted", "is-target");
		this.showGap(null);
		this.layout = null;
		this.place = null;
	}

	drop(x: number, y: number, drag: DragPayload): DropResult | null {
		if (!this.accepts(drag)) return null;
		const sections = this.sections();
		if (!this.placesAnywhere(drag)) return { kind: "listBefore", before: null, column: this.column };
		if (!this.place) this.preview(x, y, drag);
		if (!this.place) return null;
		const result = resultOf(this.placed(), this.place);
		if (result.kind === "subtask") return { kind: "nest", parent: result.parent, before: result.before };
		if (sections) return { kind: "group", list: sections.list, date: sections.date, group: result.group, before: result.before };
		return { kind: "listBefore", before: result.before, column: this.column };
	}

	/** A list with sections places a card from anywhere; another only one from itself. */
	private placesAnywhere(drag: DragPayload): boolean {
		return drag.from === this.column || this.sections() !== null;
	}

	/**
	 * The cards that stay in the list and the headers, where they stand without the steps aside: measured afresh at each
	 * move, as the lifted cards close up.
	 */
	private measure(): Layout {
		const shift = shownCardSize().height + shownCardSize().gap;
		const rest = (node: HTMLElement) => {
			const r = node.getBoundingClientRect();
			return node.classList.contains("is-shifted") ? new DOMRect(r.left, r.top - shift, r.width, r.height) : r;
		};
		const cards: Measured[] = [];
		const heads: (PlacedHead & { el: HTMLElement })[] = [];
		const entries = new Map(this.list.cards.map((entry) => [entry.card, entry]));
		const groups = this.list.groups;
		let groupIndex = 0;
		for (const node of this.list.elements) {
			if (node.classList.contains("is-lifted")) continue;
			const entry = entries.get(node);
			if (entry) {
				cards.push({ entry, rect: rest(node) });
				continue;
			}
			while (groupIndex < groups.length && !node.classList.contains("tc-group-head")) groupIndex++;
			const r = rest(node);
			heads.push({ el: node, group: groups[groupIndex++]?.name ?? null, firstCard: cards.length, top: r.top, height: r.height });
		}
		this.layout = { cards, heads };
		return this.layout;
	}

	private placed(): PlacedCard[] {
		return (this.layout ?? this.measure()).cards.map(({ entry, rect }) => ({ key: entry.item.key, level: entry.level, top: rect.top, height: rect.height, group: entry.item.group }));
	}

	/** A header stands after the gap when its first card does, or the gap ends a section above it. */
	private headAfter(head: PlacedHead, place: ListPlace & { kind: "gap" }, heads: readonly PlacedHead[]): boolean {
		const order = (group: typeof head.group) => heads.findIndex((h) => h.group === group);
		return head.firstCard > place.index || (head.firstCard === place.index && order(head.group) > order(place.group));
	}

	/** The gap where the dragged card stood: the cards before it stay above. */
	private liftedFrom(): ListPlace {
		const all = this.list.cards;
		const at = all.findIndex((entry) => entry.card.classList.contains("is-lifted"));
		const cards = (this.layout ?? this.measure()).cards;
		if (at < 0) return { kind: "gap", index: cards.length, level: 0, group: cards[cards.length - 1]?.entry.item.group ?? null };
		const before = all.slice(0, at).filter((entry) => !entry.card.classList.contains("is-lifted")).length;
		return { kind: "gap", index: before, level: all[at].level, group: all[at].item.group };
	}

	private indent(): number {
		return tokenPx(this.list.el, INDENT);
	}

	/** Where a task's card starts: a subtask's stands its levels further in. */
	private baseLeft(): number {
		const first = (this.layout ?? this.measure()).cards[0];
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

import { shownCardSize } from "../cardSize";
import { DESIGN, LAYOUT, PROPERTY, tokenPx } from "../design";
import { px } from "../dom";
import type { ListEntry, TaskList } from "../TaskList";
import { AutoScroll } from "./AutoScroll";
import type { ColumnSections, DragPayload, DropResult, DropTarget, ListColumn } from "./DropTarget";
import { DropGap } from "./DropGap";
import { type GapPlace, type ListPlace, type PlacedCard, type PlacedHead, placeAt, resultOf, samePlace } from "./listPlace";

const INDENT = "--tc-subtask-indent";
const LIFTED = "is-lifted";
const SHIFTED = "is-shifted";
const TARGET = "is-target";
/** The list draws its cards where the drag puts them, each at its own `--tc-room`. */
const MAKING_ROOM = "is-making-room";

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
 *
 * The cards never leave their places in the layout during a drag: the lifted ones only hide, and every card is drawn
 * where the drag wants it by a transform that eases there. So nothing reflows under the finger, and the room the list makes
 * (`room`) stays open where it is while the finger is over a card, moving only when the finger picks another gap.
 */
export class ListDrop implements DropTarget {
	/** What a drop means now. */
	private place: ListPlace | null = null;
	/** Where the list stands open: the place shown last between cards; in its own list, from the lift on, where the card was. */
	private room: GapPlace | null = null;
	private layout: Layout | null = null;
	private last: { x: number; y: number; drag: DragPayload } | null = null;
	private readonly gap: DropGap;
	private readonly scroll: AutoScroll;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		private readonly accepts: (drag: DragPayload) => boolean,
		/** Whose sections the column shows; null for a past day's column. */
		private readonly sections: () => ColumnSections | null = () => null,
	) {
		this.gap = new DropGap(() => this.list.el);
		this.scroll = new AutoScroll(
			() => this.list.el,
			() => this.last && this.preview(this.last.x, this.last.y, this.last.drag),
		);
	}

	/** The list and the column's title over it: a finger carried up past the list puts the card on its top. */
	hitTest(x: number, y: number, drag: DragPayload): boolean {
		if (!this.accepts(drag)) return false;
		const r = this.area.getBoundingClientRect();
		return x >= r.left && x < r.right && y >= r.top - DESIGN.columnsTop && y < r.bottom;
	}

	preview(x: number, y: number, drag: DragPayload): void {
		this.last = { x, y, drag };
		const layout = this.measure();
		if (!this.placesAnywhere(drag)) {
			this.place = { kind: "gap", index: layout.cards.length, level: 0, group: null };
			return;
		}
		const card = shownCardSize();
		const indent = this.indent();
		const level = indent > 0 ? (x - drag.grabX - this.baseLeft()) / indent : 0;
		const heads = this.sections() ? layout.heads : [];
		const room = this.room ?? this.liftedFrom();
		const held = this.place ?? room;
		const place = placeAt(this.placed(), y, level, card.height + card.gap, room, heads, held, LAYOUT.dropHysteresis);
		this.place = place;
		this.room = place.kind === "gap" ? place : room;
		this.arrange();
		layout.cards.forEach(({ entry }, i) => entry.card.classList.toggle(TARGET, place.kind === "into" && i === place.index));
		const open = this.room ? this.gapRect(this.room) : null;
		if (open) this.gap.show(open, place.kind === "gap");
		else this.gap.hide();
		this.scroll.follow(y);
	}

	landing(): DOMRect | null {
		if (!this.layout || !this.place) return null;
		if (this.place.kind === "into") return this.layout.cards[this.place.index].rect;
		return this.gapRect(this.place);
	}

	/** The finger has left the list: the room goes back to where the card was lifted from, dashed, so it is plain where to bring it back. */
	leave(): void {
		this.reset(this.liftedFrom());
		if (this.room) this.gap.show(this.gapRect(this.room), true);
		else this.gap.hide();
	}

	/** The drag is over: the room closes, and with no card lifted from it the list stands as it was. */
	clear(): void {
		this.reset(null);
		this.gap.hide();
		this.layout = null;
	}

	private reset(room: GapPlace | null): void {
		this.scroll.stop();
		for (const node of this.list.elements) node.classList.remove(TARGET);
		this.place = null;
		this.room = room;
		this.last = null;
		this.layout = null;
		this.arrange();
	}

	drop(x: number, y: number, drag: DragPayload): DropResult | null {
		if (!this.accepts(drag)) return null;
		const sections = this.sections();
		if (!this.placesAnywhere(drag)) return { kind: "listBefore", before: null, column: this.column };
		if (!this.place) this.preview(x, y, drag);
		if (!this.place || this.isHome(this.place)) return null;
		const result = resultOf(this.placed(), this.place);
		if (result.kind === "subtask") return { kind: "nest", parent: result.parent, before: result.before };
		if (sections) return { kind: "group", list: sections.list, date: sections.date, group: result.group, before: result.before };
		return { kind: "listBefore", before: result.before, column: this.column };
	}

	/** The place the card was lifted from, at its level: let go there, the card only goes back. */
	private isHome(place: ListPlace): boolean {
		const home = this.liftedFrom();
		return home !== null && place.kind === "gap" && samePlace(place, home) && place.level === home.level;
	}

	/** A list with sections places a card from anywhere, and any list a new task; another only a card from itself. */
	private placesAnywhere(drag: DragPayload): boolean {
		return drag.from === "new" || drag.from === this.column || this.sections() !== null;
	}

	/**
	 * Draws each card and header where the drag wants it: those after the room a card lower, all of them closed up over
	 * the lifted cards, which keep their places in the layout but hide. With neither, the list stands as it was drawn.
	 */
	private arrange(): void {
		const nodes = this.list.elements;
		const step = shownCardSize().height + shownCardSize().gap;
		const room = this.room;
		const lifted = nodes.some((node) => node.classList.contains(LIFTED));
		if (!room && !lifted) {
			this.list.el.classList.remove(MAKING_ROOM);
			for (const node of nodes) {
				node.classList.remove(SHIFTED);
				node.style.removeProperty(PROPERTY.room);
			}
			return;
		}
		const heads = room ? (this.layout ?? this.measure()).heads : [];
		let removed = 0;
		let index = 0;
		for (const node of nodes) {
			if (node.classList.contains(LIFTED)) {
				removed += step;
				node.style.setProperty(PROPERTY.room, px(0));
				continue;
			}
			const head = heads.find((h) => h.el === node);
			const isCard = !node.classList.contains("tc-group-head");
			const after = room !== null && (isCard ? index >= room.index : head !== undefined && this.headAfter(head, room, heads));
			if (isCard) index++;
			node.classList.toggle(SHIFTED, after);
			node.style.setProperty(PROPERTY.room, px((after ? step : 0) - removed));
		}
		this.list.el.classList.add(MAKING_ROOM);
	}

	/**
	 * The cards that stay in the list and the headers, where they stand with the lifted cards gone and no room open: their
	 * places in the layout, read under whatever transform is easing them now, less the lifted cards above them.
	 */
	private measure(): Layout {
		const step = shownCardSize().height + shownCardSize().gap;
		let removed = 0;
		const rest = (node: HTMLElement) => {
			const r = node.getBoundingClientRect();
			return new DOMRect(r.left, r.top - translateY(node) - removed, r.width, r.height);
		};
		const cards: Measured[] = [];
		const heads: (PlacedHead & { el: HTMLElement })[] = [];
		const entries = new Map(this.list.cards.map((entry) => [entry.card, entry]));
		const groups = this.list.groups;
		let groupIndex = 0;
		for (const node of this.list.elements) {
			if (node.classList.contains(LIFTED)) {
				removed += step;
				continue;
			}
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
		return (this.layout ?? this.measure()).cards.map(({ entry, rect }) => ({ ...this.list.listCard(entry), top: rect.top, height: rect.height }));
	}

	/** Where a card put in `place` stands, in client pixels, at the level of the place. */
	private gapRect(place: GapPlace): DOMRect {
		const { cards, heads } = this.layout ?? this.measure();
		const card = shownCardSize();
		const r = this.list.el.getBoundingClientRect();
		const left = this.baseLeft() + place.level * this.indent();
		const right = cards[0]?.rect.right ?? r.right;
		const at = cards[place.index];
		const prev = cards[place.index - 1];
		const head = heads.find((h) => h.group === place.group);
		const inGroup = (measured: Measured) => this.list.listCard(measured.entry).group === place.group;
		const top =
			at && inGroup(at) ? at.rect.top
			: prev && inGroup(prev) ? prev.rect.bottom + card.gap
			: head ? head.top + head.height
			: heads[0]?.top ?? prev?.rect.bottom ?? r.top;
		return new DOMRect(left, top, right - left, card.height);
	}

	/** A header stands after the gap when its first card does, or the gap ends a section above it. */
	private headAfter(head: PlacedHead, place: GapPlace, heads: readonly PlacedHead[]): boolean {
		const order = (group: typeof head.group) => heads.findIndex((h) => h.group === group);
		return head.firstCard > place.index || (head.firstCard === place.index && order(head.group) > order(place.group));
	}

	/** The gap where the dragged card stood, the cards before it above; null when no card is lifted from this list. */
	private liftedFrom(): GapPlace | null {
		const all = this.list.cards;
		const at = all.findIndex((entry) => entry.card.classList.contains(LIFTED));
		if (at < 0) return null;
		const before = all.slice(0, at).filter((entry) => !entry.card.classList.contains(LIFTED)).length;
		return { kind: "gap", index: before, level: all[at].level, group: this.list.listCard(all[at]).group };
	}

	private indent(): number {
		return tokenPx(this.list.el, INDENT);
	}

	/** Where a task's card starts: a subtask's stands its levels further in. */
	private baseLeft(): number {
		const first = (this.layout ?? this.measure()).cards[0];
		return first ? first.rect.left - first.entry.level * this.indent() : this.list.el.getBoundingClientRect().left;
	}
}

/** How far a transform moves the element down right now, mid-transition included. */
function translateY(node: HTMLElement): number {
	const transform = getComputedStyle(node).transform;
	const values = /^matrix(3d)?\(([^)]*)\)$/.exec(transform ?? "");
	if (!values) return 0;
	const numbers = values[2].split(",").map(Number);
	return (values[1] ? numbers[13] : numbers[5]) || 0;
}

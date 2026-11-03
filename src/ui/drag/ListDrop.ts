import { type CardSize, shownCardSize } from "../cardSize";
import { DESIGN, LAYOUT, PROPERTY, tokenPx } from "../design";
import { px } from "../dom";
import type { ListEntry, TaskList } from "../TaskList";
import { AutoScroll } from "./AutoScroll";
import { carriesMany, type ColumnSections, type DragPayload, type DropResult, type DropTarget, type ListColumn } from "./DropTarget";
import { DropGap } from "./DropGap";
import { DropLine } from "./DropLine";
import { type ListFrame, readFrame, toClient } from "./listFrame";
import { type GapPlace, type ListPlace, type PlacedCard, type PlacedHead, placeAt, resultOf, samePlace } from "./listPlace";

const INDENT = "--tc-subtask-indent";
const LIFTED = "is-lifted";
/** A card carried with others, shown as a dashed place where it stood while the pointer is away from its list. */
const WAITING = "is-waiting";
const SHIFTED = "is-shifted";
const TARGET = "is-target";
/** The list draws its cards where the drag puts them, each at its own `--tc-room`. */
const MAKING_ROOM = "is-making-room";
/** A card or header drawn off its place: only these take a transform. */
const MOVED = "is-moved";

/** A card where it stands in the list's content, with the lifted cards gone and no room open. */
interface Measured {
	readonly entry: ListEntry;
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

/**
 * The list as measured once a drag, in its content pixels, so a scroll moves nothing in it. It holds while the list is
 * drawn with the same nodes, at the same card size and width.
 */
interface Layout {
	readonly nodes: readonly HTMLElement[];
	readonly size: CardSize;
	readonly width: number;
	readonly indent: number;
	readonly cards: readonly Measured[];
	/** Their `top` in content pixels too. */
	readonly heads: readonly (PlacedHead & { readonly el: HTMLElement })[];
}

/**
 * A list as a place to drop. The cards step aside at the finger, and a dashed place shows the level the card's left edge
 * picks; over the middle of a card the card goes into it. A new task carried on the plus goes only between cards: the
 * cards stay, a line shows the gap and the level, and each new place ticks under the finger. A list that shows sections takes a card from anywhere this way,
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
	private readonly line: DropLine;
	private readonly scroll: AutoScroll;
	/** Several cards are carried: away from the list each waits as a dashed place where it stood. */
	private many = false;
	/** The `--tc-room` last written into each node of `roomed`, so a move writes only the ones that change. */
	private readonly rooms = new Map<HTMLElement, number>();
	private roomed: readonly HTMLElement[] | null = null;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		private readonly accepts: (drag: DragPayload) => boolean,
		/** Whose sections the column shows; null for a past day's column. */
		private readonly sections: () => ColumnSections | null = () => null,
		/** The list's title stands over its area, as a column's does; Backlog's stands in its own area, under Inbox. */
		private readonly titleOver = true,
		/** A new task's place moved to another gap or level. */
		private readonly onNewPlace: () => void = () => undefined,
	) {
		this.gap = new DropGap(() => this.list.el);
		this.line = new DropLine(() => this.list.el);
		this.scroll = new AutoScroll(
			() => this.list.el,
			() => this.last && this.preview(this.last.x, this.last.y, this.last.drag),
		);
	}

	/** The list and its title: a finger carried up past the list puts the card on its top. Under the list nothing is it. */
	hitTest(x: number, y: number, drag: DragPayload): boolean {
		if (!this.takes(drag)) return false;
		const r = this.area.getBoundingClientRect();
		const bottom = Math.min(r.bottom, this.list.el.getBoundingClientRect().bottom);
		return x >= r.left && x < r.right && y >= r.top - (this.titleOver ? DESIGN.columnsTop : 0) && y < bottom;
	}

	preview(x: number, y: number, drag: DragPayload): void {
		const frame = readFrame(this.list.el);
		this.many = carriesMany(drag);
		for (const node of this.list.elements) node.classList.remove(WAITING);
		this.last = { x, y, drag };
		const layout = this.layoutFor(frame);
		if (!this.placesAnywhere(drag)) {
			this.place = { kind: "gap", index: layout.cards.length, level: 0, group: null };
			return;
		}
		const heads = this.sections() ? this.placedHeads(frame) : [];
		if (drag.from === "new") return this.previewNew(x, y, heads, frame);
		const card = layout.size;
		const level = this.cardLevel(x, drag, frame);
		const room = this.room ?? this.liftedFrom();
		const held = this.place ?? room;
		const place = placeAt(this.placed(frame), y, level, card.height + card.gap, room, heads, held, LAYOUT.dropHysteresis);
		this.place = place;
		this.room = place.kind === "gap" ? place : room;
		this.arrange(frame);
		layout.cards.forEach(({ entry }, i) => entry.card.classList.toggle(TARGET, place.kind === "into" && i === place.index));
		const open = this.room ? this.gapRect(this.room, frame) : null;
		if (open) this.gap.show(open, place.kind === "gap", frame);
		else this.gap.hide();
		this.scroll.follow(y, frame.box);
	}

	/** The new task's line in the gap at the finger, its level counted from the list's middle. */
	private previewNew(x: number, y: number, heads: readonly PlacedHead[], frame: ListFrame): void {
		const place = placeAt(this.placed(frame), y, this.newTaskLevel(x, frame), 0, null, heads, this.place, LAYOUT.dropHysteresis, false) as GapPlace;
		const before = this.place;
		this.place = place;
		if (before?.kind !== "gap" || !samePlace(before, place) || before.level !== place.level) this.onNewPlace();
		const line = this.lineRect(place, frame);
		this.line.show(line.left, line.right, line.top, frame);
		this.scroll.follow(y, frame.box);
	}

	landing(): DOMRect | null {
		if (!this.layout || !this.place) return null;
		const frame = readFrame(this.list.el);
		if (this.place.kind === "into") return this.cardRect(this.layout.cards[this.place.index], frame);
		if (this.last?.drag.from === "new") return this.lineRect(this.place, frame);
		return this.gapRect(this.place, frame);
	}

	/** The finger has left the list: the room goes back to where the card was lifted from, dashed, so it is plain where to bring it back. */
	leave(): void {
		const frame = readFrame(this.list.el);
		if (this.many) {
			for (const node of this.list.elements) node.classList.toggle(WAITING, node.classList.contains(LIFTED));
			this.reset(null);
			this.gap.hide();
			return;
		}
		this.line.hide();
		this.reset(this.liftedFrom(), frame);
		if (this.room) this.gap.show(this.gapRect(this.room, frame), true, frame);
		else this.gap.hide();
	}

	/** The drag is over: the room closes, and with no card lifted from it the list stands as it was. */
	clear(): void {
		this.many = false;
		for (const node of this.list.elements) node.classList.remove(WAITING);
		this.reset(null);
		this.gap.hide();
		this.line.hide();
		this.layout = null;
	}

	/** `frame` is needed only where a room stays open. */
	private reset(room: GapPlace | null, frame?: ListFrame): void {
		this.scroll.stop();
		for (const node of this.list.elements) node.classList.remove(TARGET);
		this.place = null;
		this.room = room;
		this.last = null;
		this.arrange(frame);
	}

	drop(x: number, y: number, drag: DragPayload): DropResult | null {
		if (!this.takes(drag)) return null;
		const sections = this.sections();
		if (!this.placesAnywhere(drag)) return { kind: "listBefore", before: null, column: this.column };
		if (!this.place) this.preview(x, y, drag);
		if (!this.place || this.isHome(this.place)) return null;
		const result = resultOf(this.placed(readFrame(this.list.el)), this.place);
		if (result.kind === "subtask") return { kind: "nest", parent: result.parent, before: result.before };
		if (sections) return { kind: "group", list: sections.list, date: sections.date, group: result.group, before: result.before };
		return { kind: "listBefore", before: result.before, column: this.column };
	}

	/** The place the card was lifted from, at its level: let go there, the card only goes back. */
	private isHome(place: ListPlace): boolean {
		if (this.many) return false;
		const home = this.liftedFrom();
		return home !== null && place.kind === "gap" && samePlace(place, home) && place.level === home.level;
	}

	/** The list takes the card under the finger and every card carried along with it. */
	private takes(drag: DragPayload): boolean {
		if (!this.accepts(drag)) return false;
		return drag.from === "new" || (drag.carried ?? []).every((carried) => this.accepts({ ...drag, from: carried.from }));
	}

	/** A list with sections places a card from anywhere, and any list a new task; another only a card from itself. */
	private placesAnywhere(drag: DragPayload): boolean {
		return drag.from === "new" || drag.from === this.column || this.sections() !== null;
	}

	/**
	 * Draws each card and header where the drag wants it: those after the room a card lower, all of them closed up over
	 * the lifted cards, which keep their places in the layout but hide. With neither, the list stands as it was drawn.
	 */
	private arrange(frame?: ListFrame): void {
		const nodes = this.list.elements;
		if (this.roomed !== nodes) {
			this.rooms.clear();
			this.roomed = nodes;
		}
		const card = shownCardSize();
		const step = card.height + card.gap;
		const room = this.room;
		const gone = (node: HTMLElement) => node.classList.contains(LIFTED) && !node.classList.contains(WAITING);
		const lifted = nodes.some(gone);
		if (!room && !lifted) {
			this.list.el.classList.remove(MAKING_ROOM);
			for (const node of this.rooms.keys()) {
				node.classList.remove(SHIFTED, MOVED);
				node.style.removeProperty(PROPERTY.room);
			}
			this.rooms.clear();
			return;
		}
		const heads = room ? this.layoutFor(frame ?? readFrame(this.list.el)).heads : [];
		let removed = 0;
		let index = 0;
		for (const node of nodes) {
			if (gone(node)) {
				removed += step;
				this.setRoom(node, 0);
				continue;
			}
			const head = heads.find((h) => h.el === node);
			const isCard = !node.classList.contains("tc-group-head");
			const after = room !== null && (isCard ? index >= room.index : head !== undefined && this.headAfter(head, room, heads));
			if (isCard) index++;
			node.classList.toggle(SHIFTED, after);
			this.setRoom(node, (after ? step : 0) - removed);
		}
		this.list.el.classList.add(MAKING_ROOM);
	}

	private setRoom(node: HTMLElement, value: number): void {
		if (this.rooms.get(node) === value) return;
		node.style.setProperty(PROPERTY.room, px(value));
		node.classList.toggle(MOVED, value !== 0);
		this.rooms.set(node, value);
	}

	/** The layout measured for this drag, measured again only once the list is drawn anew or changes its card size or width. */
	private layoutFor(frame: ListFrame): Layout {
		const nodes = this.list.elements;
		const size = shownCardSize();
		const width = frame.box.width;
		const kept = this.layout;
		if (kept && kept.nodes === nodes && kept.size === size && kept.width === width) return kept;
		this.layout = this.measure(nodes, size, width);
		return this.layout;
	}

	/**
	 * The cards that stay in the list and the headers, where they stand with the lifted cards gone and no room open: their
	 * places in the layout, which no transform moves, less the lifted cards above them. Read once, in content pixels.
	 */
	private measure(nodes: readonly HTMLElement[], size: CardSize, width: number): Layout {
		const step = size.height + size.gap;
		let removed = 0;
		const cards: Measured[] = [];
		const heads: (PlacedHead & { el: HTMLElement })[] = [];
		const entries = new Map(this.list.cards.map((entry) => [entry.card, entry]));
		const groups = this.list.groups;
		let groupIndex = 0;
		for (const node of nodes) {
			if (node.classList.contains(LIFTED)) {
				removed += step;
				continue;
			}
			const entry = entries.get(node);
			if (entry) {
				cards.push({ entry, top: node.offsetTop - removed, left: node.offsetLeft, width: node.offsetWidth, height: node.offsetHeight });
				continue;
			}
			while (groupIndex < groups.length && !node.classList.contains("tc-group-head")) groupIndex++;
			heads.push({ el: node, group: groups[groupIndex++]?.name ?? null, firstCard: cards.length, top: node.offsetTop - removed, height: node.offsetHeight });
		}
		return { nodes, size, width, indent: tokenPx(this.list.el, INDENT), cards, heads };
	}

	/** A measured card in client pixels. */
	private cardRect(card: Measured, frame: ListFrame): DOMRect {
		const at = toClient(frame, card.left, card.top);
		return new DOMRect(at.x, at.y, card.width, card.height);
	}

	private placed(frame: ListFrame): PlacedCard[] {
		return this.layoutFor(frame).cards.map((card) => ({ ...this.list.listCard(card.entry), top: toClient(frame, 0, card.top).y, height: card.height }));
	}

	private placedHeads(frame: ListFrame): PlacedHead[] {
		return this.layoutFor(frame).heads.map((head) => ({ ...head, top: toClient(frame, 0, head.top).y }));
	}

	/** Where a card put in `place` stands, in client pixels, at the level of the place. */
	private gapRect(place: GapPlace, frame: ListFrame): DOMRect {
		const layout = this.layoutFor(frame);
		const cards = layout.cards.map((card) => ({ entry: card.entry, rect: this.cardRect(card, frame) }));
		const heads = this.placedHeads(frame);
		const card = layout.size;
		const r = frame.box;
		const left = this.baseLeft(frame) + place.level * layout.indent;
		const right = cards[0]?.rect.right ?? r.right;
		const at = cards[place.index];
		const prev = cards[place.index - 1];
		const head = heads.find((h) => h.group === place.group);
		const inGroup = (measured: { entry: ListEntry }) => this.list.listCard(measured.entry).group === place.group;
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

	/** A card carried along: the level its left edge stands at. */
	private cardLevel(x: number, drag: DragPayload, frame: ListFrame): number {
		const indent = this.layoutFor(frame).indent;
		return indent > 0 ? (x - drag.grabX - this.baseLeft(frame)) / indent : 0;
	}

	/**
	 * A new task: on the list's left half as shallow as the neighbours allow; right of the middle a level deeper for each
	 * indent, as if the finger held the left edge of a task's card standing in the middle. So the thumb picks a task, a
	 * subtask or one under that near the middle of the screen, never stretching to the list's left edge.
	 */
	private newTaskLevel(x: number, frame: ListFrame): number {
		const r = frame.box;
		const indent = this.layoutFor(frame).indent;
		return indent > 0 ? (x - (r.left + r.width / 2)) / indent : 0;
	}

	/** The new task's line: through the middle of the gap, from the left edge of its level; with no height. */
	private lineRect(place: GapPlace, frame: ListFrame): DOMRect {
		const gap = this.gapRect(place, frame);
		return new DOMRect(gap.left, gap.top - this.layoutFor(frame).size.gap / 2, gap.width, 0);
	}

	/** Where a task's card starts: a subtask's stands its levels further in. */
	private baseLeft(frame: ListFrame): number {
		const layout = this.layoutFor(frame);
		const first = layout.cards[0];
		return first ? toClient(frame, first.left, 0).x - first.entry.level * layout.indent : frame.box.left;
	}
}

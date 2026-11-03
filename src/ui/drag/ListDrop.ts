import { shownCardSize } from "../cardSize";
import { DESIGN, LAYOUT, tokenPx } from "../design";
import type { ListEntry, TaskList } from "../TaskList";
import { AutoScroll } from "./AutoScroll";
import { carriesMany, type ColumnSections, type DragPayload, type DropResult, type DropTarget, type ListColumn } from "./DropTarget";
import { DropLine } from "./DropLine";
import { type GapPlace, type ListPlace, type PlacedCard, type PlacedHead, placeAt, resultOf, samePlace } from "./listPlace";

const INDENT = "--tc-subtask-indent";
const LIFTED = "is-lifted";
/** A lifted card that stays where it stood as a dashed place; its subtasks fold away under it. */
const WAITING = "is-waiting";
const TARGET = "is-target";

interface Measured {
	readonly entry: ListEntry;
	readonly rect: DOMRect;
}

interface Layout {
	readonly cards: readonly Measured[];
	readonly heads: readonly PlacedHead[];
}

/**
 * A list as a place to drop. No card moves while a drag goes on: a card lifted from the list waits as a dashed place where
 * it stood, and the calendar's drop line between two cards shows the gap and the level, as it does for a new task carried
 * on the plus. A card carried along takes the gap its top edge picks and the level its left edge picks, so the line stays in
 * sight over it; over another card's lower part it goes into that card, lit; a new task takes its level from the list's middle, goes only between cards, and each new place ticks
 * under the finger. A list that shows sections takes a card from anywhere this way, into the section of the gap; another
 * list takes a card from elsewhere at its end.
 */
export class ListDrop implements DropTarget {
	/** What a drop means now. */
	private place: ListPlace | null = null;
	private layout: Layout | null = null;
	private last: { x: number; y: number; drag: DragPayload } | null = null;
	private readonly line: DropLine;
	private readonly scroll: AutoScroll;

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
		this.last = { x, y, drag };
		const layout = this.measure();
		const fresh = drag.from === "new";
		const before = this.place;
		const place = !this.placesAnywhere(drag)
			? { kind: "gap" as const, index: layout.cards.length, level: 0, group: null }
			: placeAt(this.placed(), fresh ? y : this.cardY(y, drag), fresh ? this.newTaskLevel(x) : this.cardLevel(x, drag), 0, null, this.sections() ? layout.heads : [], this.place ?? this.liftedFrom(), LAYOUT.dropHysteresis, !fresh);
		this.place = place;
		if (fresh && (before?.kind !== "gap" || place.kind !== "gap" || !samePlace(before, place) || before.level !== place.level)) this.onNewPlace();
		layout.cards.forEach(({ entry }, i) => entry.card.classList.toggle(TARGET, place.kind === "into" && i === place.index));
		if (place.kind === "gap" && !this.isHome(place)) {
			const line = this.lineRect(place);
			this.line.show(line.left, line.right, line.top, fresh ? { x, y } : null);
		} else this.line.hide();
		this.scroll.follow(y);
	}

	landing(): DOMRect | null {
		if (!this.layout || !this.place) return null;
		if (this.place.kind === "into") return this.layout.cards[this.place.index].rect;
		if (this.last?.drag.from === "new") return this.lineRect(this.place);
		const gap = this.gapRect(this.place);
		const leaving = this.waitingAbove(this.place.index) * stepOf();
		return new DOMRect(gap.left, gap.top - leaving, gap.width, gap.height);
	}

	/** The finger has left the list: the line goes, a card lifted from it still waits dashed where it stood. */
	leave(): void {
		this.line.hide();
		this.reset();
	}

	/** The drag is over. */
	clear(): void {
		this.line.hide();
		this.reset();
		this.layout = null;
	}

	private reset(): void {
		this.scroll.stop();
		for (const node of this.list.elements) node.classList.remove(TARGET);
		this.place = null;
		this.last = null;
		this.layout = null;
	}

	drop(x: number, y: number, drag: DragPayload): DropResult | null {
		if (!this.takes(drag)) return null;
		const sections = this.sections();
		if (!this.placesAnywhere(drag)) return { kind: "listBefore", before: null, column: this.column };
		if (!this.place) this.preview(x, y, drag);
		if (!this.place || this.isHome(this.place)) return null;
		const result = resultOf(this.placed(), this.place);
		if (result.kind === "subtask") return { kind: "nest", parent: result.parent, before: result.before };
		if (sections) return { kind: "group", list: sections.list, date: sections.date, group: result.group, before: result.before };
		return { kind: "listBefore", before: result.before, column: this.column };
	}

	/** The place the card was lifted from, at its level: let go there, the card only goes back. Several cards carried have none. */
	private isHome(place: ListPlace): boolean {
		const home = this.liftedFrom();
		return home !== null && !this.carriesMany() && place.kind === "gap" && samePlace(place, home) && place.level === home.level;
	}

	private carriesMany(): boolean {
		return this.last !== null && carriesMany(this.last.drag);
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

	/** The cards that stay in the list and the headers, where they stand: a lifted card's dashed place keeps its room. */
	private measure(): Layout {
		const cards: Measured[] = [];
		const heads: PlacedHead[] = [];
		const entries = new Map(this.list.cards.map((entry) => [entry.card, entry]));
		const groups = this.list.groups;
		let groupIndex = 0;
		for (const node of this.list.elements) {
			if (node.classList.contains(LIFTED)) continue;
			const entry = entries.get(node);
			if (entry) {
				cards.push({ entry, rect: node.getBoundingClientRect() });
				continue;
			}
			while (groupIndex < groups.length && !node.classList.contains("tc-group-head")) groupIndex++;
			const r = node.getBoundingClientRect();
			heads.push({ group: groups[groupIndex++]?.name ?? null, firstCard: cards.length, top: r.top, height: r.height });
		}
		this.layout = { cards, heads };
		return this.layout;
	}

	/** The dashed places above the gap before card `index`: they go once the drop is written, and the cards below close up. */
	private waitingAbove(index: number): number {
		const next = (this.layout ?? this.measure()).cards[index]?.entry.card;
		let count = 0;
		for (const { card } of this.list.cards) {
			if (card === next) break;
			if (card.classList.contains(WAITING)) count++;
		}
		return count;
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

	/** The gap where the dragged card stood, the cards before it above; null when no card is lifted from this list. */
	private liftedFrom(): GapPlace | null {
		const all = this.list.cards;
		const at = all.findIndex((entry) => entry.card.classList.contains(LIFTED));
		if (at < 0) return null;
		const before = all.slice(0, at).filter((entry) => !entry.card.classList.contains(LIFTED)).length;
		return { kind: "gap", index: before, level: all[at].level, group: this.list.listCard(all[at]).group };
	}

	/**
	 * A card carried along: the gap is picked by its top edge, so the line stands in the nearest gap above the card, never
	 * under it. Read as a finger half a card above that edge, the card goes into another one when its top edge is over
	 * that card's lower part, the lit card in sight above it.
	 */
	private cardY(y: number, drag: DragPayload): number {
		return y - drag.grabPx - shownCardSize().height / 2;
	}

	/** A card carried along: the level its left edge stands at. */
	private cardLevel(x: number, drag: DragPayload): number {
		const indent = this.indent();
		return indent > 0 ? (x - drag.grabX - this.baseLeft()) / indent : 0;
	}

	/**
	 * A new task: on the list's left half as shallow as the neighbours allow; right of the middle a level deeper for each
	 * indent, as if the finger held the left edge of a task's card standing in the middle. So the thumb picks a task, a
	 * subtask or one under that near the middle of the screen, never stretching to the list's left edge.
	 */
	private newTaskLevel(x: number): number {
		const r = this.list.el.getBoundingClientRect();
		const indent = this.indent();
		return indent > 0 ? (x - (r.left + r.width / 2)) / indent : 0;
	}

	/** The drop line: through the middle of the gap, or of the dashed place a card is moved to another level in; from the left edge of its level, with no height. */
	private lineRect(place: GapPlace): DOMRect {
		const gap = this.gapRect(place);
		const home = this.liftedFrom();
		const waiting = home && samePlace(place, home) ? this.list.cards.find((entry) => entry.card.classList.contains(LIFTED))?.card : undefined;
		if (waiting && !this.carriesMany()) {
			const r = waiting.getBoundingClientRect();
			return new DOMRect(gap.left, r.top + r.height / 2, gap.width, 0);
		}
		return new DOMRect(gap.left, gap.top - shownCardSize().gap / 2, gap.width, 0);
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

function stepOf(): number {
	return shownCardSize().height + shownCardSize().gap;
}

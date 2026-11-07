import { carriedMiddle, type GapPlace, levelAt, placeOfDrop, placesInGap, sameGap } from "../../../core/application/contracts";
import { type CardSize, shownCardSize } from "../cardSize";
import { DESIGN, LAYOUT, tokenPx } from "../design";
import { type ListEntry, PLATE, type TaskList } from "../TaskList";
import { AutoScroll } from "./AutoScroll";
import { carriesMany, type ColumnSections, type DragOrigin, type DragPayload, type DropResult, type DropTarget, type ListColumn, originsOf } from "./DropTarget";
import { DropLine } from "./DropLine";
import { type ListFrame, readFrame, toClient } from "./listFrame";
import { headerOfPlace, type PlacedCard, type PlacedHead, placeAt, sameHeader } from "./listPlace";

const INDENT = "--tc-subtask-indent";
const LIFTED = "is-lifted";
/** A lifted card that stays where it stood as a dashed place; the other lifted ones, its subtasks, fold away under it. */
const WAITING = "is-waiting";
/** An empty section's plate under the card. */
const HOT = "is-hot";

/** A card where it stands in the list's content, the folded cards gone. */
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
	readonly heads: readonly PlacedHead[];
	/** The first dashed place, where a card carried alone was lifted from: its top and height in content pixels. */
	readonly waiting: { readonly top: number; readonly height: number } | null;
}

/**
 * A list as a place to drop. No card moves while a drag goes on: a card lifted from the list waits as a dashed place where
 * it stood, and the calendar's drop line between two cards shows the gap and the level, as it does for a new task carried
 * on the plus. Nothing goes into a card: a card carried along takes the gap its middle picks, a new task the gap under the
 * finger; both take their level from where the finger stands against the list's middle, and each new place of a new task
 * ticks under the finger. A list that shows sections takes a card from
 * anywhere this way, into the section of the gap; another list takes a card from elsewhere at its end.
 */
export class ListDrop implements DropTarget {
	/** What a drop means now. */
	private place: GapPlace | null = null;
	private layout: Layout | null = null;
	private last: { x: number; y: number; drag: DragPayload } | null = null;
	private readonly line: DropLine;
	/** The No tasks plate the drop puts the card on, lit while it does. */
	private plate: HTMLElement | null = null;
	private readonly scroll: AutoScroll;

	constructor(
		private readonly list: TaskList,
		private readonly area: HTMLElement,
		readonly column: ListColumn,
		/** Whether the list takes tasks carried from these places, the one under the finger first (`acceptsDrop`). */
		private readonly accepts: (origins: readonly DragOrigin[]) => boolean,
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
		const frame = readFrame(this.list.el);
		this.last = { x, y, drag };
		const layout = this.layoutFor(frame);
		const fresh = drag.from === "new";
		const before = this.place;
		const place = !this.placesAnywhere(drag)
			? { kind: "gap" as const, index: layout.cards.length, level: 0, group: null }
			: placeAt(
					this.placed(frame),
					fresh ? y : this.cardY(y, drag, layout),
					this.levelAt(x, frame),
					0,
					null,
					this.sections() ? this.placedHeads(frame) : [],
					this.place ?? this.liftedFrom(),
					LAYOUT.dropHysteresis,
				);
		this.place = place;
		if (fresh && (!before || !sameGap(before, place) || before.level !== place.level)) this.onNewPlace();
		const home = this.isHome(place, frame);
		const plate = home ? null : this.list.plateOf(place.group, place.project);
		this.light(plate);
		if (plate) this.line.hide();
		else if (!home) {
			const line = this.lineRect(place, frame);
			this.line.show(line.left, line.right, line.top, frame, fresh ? { x, y } : null);
		} else this.line.hide();
		this.scroll.follow(y, frame.box);
	}

	/** The plus shrinks into the plate it lights or into the line's dot. */
	landing(): DOMRect | null {
		if (!this.layout || !this.place) return null;
		if (this.plate) return this.plate.getBoundingClientRect();
		return this.lineRect(this.place, readFrame(this.list.el));
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

	/** An empty section's plate lights while the card would land in it; any other goes dark. */
	private light(plate: HTMLElement | null): void {
		if (plate === this.plate) return;
		this.plate?.classList.remove(HOT);
		plate?.classList.add(HOT);
		this.plate = plate;
	}

	private reset(): void {
		this.light(null);
		this.scroll.stop();
		this.place = null;
		this.last = null;
	}

	drop(x: number, y: number, drag: DragPayload): DropResult | null {
		if (!this.takes(drag)) return null;
		if (!this.placesAnywhere(drag)) return { kind: "place", column: this.column, place: null };
		if (!this.place) this.preview(x, y, drag);
		if (!this.place) return null;
		const place = placeOfDrop(this.placed(readFrame(this.list.el)), this.place, this.home());
		return place && { kind: "place", column: this.column, place };
	}

	/** The place a card carried alone was lifted from, at its level; several cards carried have none. */
	private home(): GapPlace | null {
		return this.carriesMany() ? null : this.liftedFrom();
	}

	/** The card goes back where it was lifted from: the drop would change nothing, so no line or plate shows. */
	private isHome(place: GapPlace, frame: ListFrame): boolean {
		return placeOfDrop(this.placed(frame), place, this.home()) === null;
	}

	private carriesMany(): boolean {
		return this.last !== null && carriesMany(this.last.drag);
	}

	/** The list takes the card under the finger and every card carried along with it. */
	private takes(drag: DragPayload): boolean {
		return this.accepts(originsOf(drag));
	}

	/** Whether the gap under the finger is the place, or the list's end is (`placesInGap`). */
	private placesAnywhere(drag: DragPayload): boolean {
		return placesInGap(this.column, drag.from, this.sections() !== null);
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
	 * The cards that stay in the list and the headers, where they stand: a dashed place keeps its room, the folded cards
	 * are taken as gone already, though they may still be folding. Read once, in content pixels.
	 */
	private measure(nodes: readonly HTMLElement[], size: CardSize, width: number): Layout {
		const step = size.height + size.gap;
		let removed = 0;
		let waiting: Layout["waiting"] = null;
		const cards: Measured[] = [];
		const heads: PlacedHead[] = [];
		const entries = new Map(this.list.cards.map((entry) => [entry.card, entry]));
		for (const node of nodes) {
			if (node.classList.contains(LIFTED)) {
				if (!node.classList.contains(WAITING)) removed += step;
				else waiting ??= { top: node.offsetTop - removed, height: node.offsetHeight };
				continue;
			}
			if (node.classList.contains(PLATE)) continue;
			const entry = entries.get(node);
			if (entry) {
				cards.push({ entry, top: node.offsetTop - removed, left: node.offsetLeft, width: node.offsetWidth, height: node.offsetHeight });
				continue;
			}
			const header = this.list.headerAt(node);
			if (header !== undefined) heads.push({ group: header, opens: node.classList.contains("is-project"), firstCard: cards.length, top: node.offsetTop - removed, height: node.offsetHeight });
		}
		return { nodes, size, width, indent: tokenPx(this.list.el, INDENT), cards, heads, waiting };
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
		const header = headerOfPlace(place);
		const head = [...heads].reverse().find((h) => sameHeader(h.group, header));
		const inGroup = (measured: { entry: ListEntry }) => {
			const card = this.list.listCard(measured.entry);
			return sameHeader(card.project === undefined ? card.group : { group: card.group, project: card.project }, header);
		};
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
		const { group, project } = this.list.listCard(all[at]);
		return { kind: "gap", index: before, level: all[at].level, group, ...(project !== undefined && { project }) };
	}

	/** A card carried along: the gap is picked by its middle, so it goes into the gap its middle is nearest to. */
	private cardY(y: number, drag: DragPayload, layout: Layout): number {
		return carriedMiddle(y, drag.grabPx, layout.size.height);
	}

	/** The level the finger's `x` asks for (`levelAt` in the core), in this list's box and indent. */
	private levelAt(x: number, frame: ListFrame): number {
		return levelAt(x, { left: frame.box.left, width: frame.box.width }, this.layoutFor(frame).indent);
	}

	/** The drop line: through the middle of the gap, from the left edge of its level, with no height; a card moved to another level where it stood has it in the gap over its dashed place, never on it. */
	private lineRect(place: GapPlace, frame: ListFrame): DOMRect {
		const layout = this.layoutFor(frame);
		const gap = this.gapRect(place, frame);
		const home = this.liftedFrom();
		if (layout.waiting && home && sameGap(place, home) && !this.carriesMany()) {
			const over = toClient(frame, 0, layout.waiting.top - layout.size.gap / 2).y;
			return new DOMRect(gap.left, over, gap.width, 0);
		}
		return new DOMRect(gap.left, gap.top - layout.size.gap / 2, gap.width, 0);
	}

	/** Where a task's card starts: a subtask's stands its levels further in. */
	private baseLeft(frame: ListFrame): number {
		const layout = this.layoutFor(frame);
		const first = layout.cards[0];
		return first ? toClient(frame, first.left, 0).x - first.entry.level * layout.indent : frame.box.left;
	}
}

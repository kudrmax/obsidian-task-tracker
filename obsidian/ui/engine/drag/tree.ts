import { arrayMove } from "@dnd-kit/sortable";
import type { LevelRange, Row } from "../port";

/** How far a sideways swipe goes for one level deeper or shallower (Max, 2026-11-18: «try 20»). */
export const SWIPE_STEP = 20;
/** How long the hand rests on a new spot before its sideways moves count as swipes: the way there is no swipe. */
export const SWIPE_REST_MS = 100;

/**
 * The carried card's level by sideways swipes, not by where the hand is (Max, 2026-11-18). On a new spot the card is a
 * task of the row below it (its own level on its own spot). Once the hand has rested there a moment, each `SWIPE_STEP`
 * swiped right is one level deeper, left one shallower, as far as the spot allows (`allowed`, the levels between the rows
 * around it); the moves that brought the hand there count for nothing. A swipe past what the spot allows builds up
 * nothing: from there one step back is one level back.
 */
export class SwipeLevel {
	private spot: string | null;
	private level: number;
	private moved = 0;
	private resting = false;

	/**
	 * `home`: the card's own spot, where it keeps its own `depth` (null for the plus); `from`, `lastMove`: where and when it
	 * was lifted, so the moves on its own spot count from there.
	 */
	constructor(
		private readonly home: string | null,
		private readonly depth: number,
		private from: number,
		private lastMove: number,
	) {
		this.spot = home;
		this.level = depth;
	}

	/** The level at the pointer's `x` at time `now` (ms) on `spot` (a key naming the place: a new key is a new place). */
	at(x: number, now: number, spot: string, allowed: (wanted: number) => number): number {
		if (spot !== this.spot) {
			this.spot = spot;
			this.moved = 0;
			this.resting = false;
			this.lastMove = now;
			this.level = allowed(spot === this.home ? this.depth : 0);
		}
		const dx = x - this.from;
		this.from = x;
		if (!this.resting && now - this.lastMove >= SWIPE_REST_MS) this.resting = true;
		if (dx !== 0) this.lastMove = now;
		if (!this.resting) return this.level;
		this.moved += dx;
		while (Math.abs(this.moved) >= SWIPE_STEP) {
			const way = Math.sign(this.moved);
			const next = allowed(this.level + way);
			if (next === this.level) {
				this.moved = 0;
				break;
			}
			this.level = next;
			this.moved -= way * SWIPE_STEP;
		}
		if (this.moved !== 0 && allowed(this.level + Math.sign(this.moved)) === this.level) this.moved = 0;
		return this.level;
	}
}

/** The key of the spot `id` stands at in `order` of `list`: its neighbours. */
export function spotKey(list: string, order: readonly string[], id: string): string {
	const at = order.indexOf(id);
	return `${list}|${order[at - 1] ?? ""}|${order[at + 1] ?? ""}`;
}

/** The depth a section header stands for: under it no card can be a subtask. */
const HEADER = -1;

const depthOf = (row: Row): number => (row.kind === "task" ? row.depth : HEADER);

/** Where a card stands in a list's order of rows: the section it is in (null: none), and the task right after it (null: none, it ends its section). */
export interface Slot {
	readonly section: string | null;
	readonly before: string | null;
}

/**
 * The slot of `id` in `order` (a list's row ids, `id` among them), by the rows around it: the section of the header (or
 * nothing) above it, and the task right below it, if a task comes before the next header.
 */
export function slotOf(rows: readonly Row[], order: readonly string[], id: string): Slot {
	const kinds = new Map(rows.map((row) => [row.id, row]));
	const at = order.indexOf(id);
	let section: string | null = null;
	for (let i = at - 1; i >= 0; i--) {
		const row = kinds.get(order[i]);
		if (row?.kind === "section") {
			section = row.id;
			break;
		}
	}
	const next = at >= 0 ? kinds.get(order[at + 1] ?? "") : undefined;
	return { section, before: next?.kind === "task" ? next.id : null };
}

/** The core's nesting, asked through the port: the levels a card may take between a card at `above` and one at `below` (null: none or a header). */
export type Levels = (above: number | null, below: number | null) => LevelRange;

/** A row's level as the nesting reads it: a task's depth; null for none or a section's header. */
const levelOf = (row: Row | undefined): number | null => (row?.kind === "task" ? row.depth : null);

/** The level a card asking for `wanted` takes between the row `above` and the row `below` its place: as near `wanted` as the core's nesting allows. */
export function levelBetween(levels: Levels, above: Row | undefined, below: Row | undefined, wanted: number): number {
	const { min, max } = levels(levelOf(above), levelOf(below));
	return Math.max(min, Math.min(max, Math.max(0, wanted)));
}

/** The level the carried card `activeId` takes when it stands where `overId` is now, asking for `wanted`. */
export function levelAt(levels: Levels, rows: readonly Row[], activeId: string, overId: string, wanted: number): number {
	const from = rows.findIndex((row) => row.id === activeId);
	if (from < 0) return 0;
	const found = rows.findIndex((row) => row.id === overId);
	const to = found < 0 ? from : found;
	const moved = arrayMove([...rows], from, to);
	return levelBetween(levels, moved[to - 1], moved[to + 1], wanted);
}

/** The rows under `id` (its subtasks, theirs…): they fold away while it is carried and travel with it. */
export function descendantsOf(rows: readonly Row[], id: string): ReadonlySet<string> {
	const at = rows.findIndex((row) => row.id === id);
	const out = new Set<string>();
	if (at < 0) return out;
	const top = depthOf(rows[at]);
	for (let i = at + 1; i < rows.length && depthOf(rows[i]) > top; i++) out.add(rows[i].id);
	return out;
}

/** The list's order once the carried card (at `activeIndex` of `ids`) is let go where it stands now (`overIndex`), as dnd-kit's sortable list puts it. */
export function finalOrder(ids: readonly string[], activeIndex: number, overIndex: number): readonly string[] {
	return arrayMove([...ids], activeIndex, overIndex < 0 ? activeIndex : overIndex);
}

/** The room the rows before `id` take in `order`: where `id` stands, from the order's first row. */
function topIn(order: readonly string[], id: string, heightOf: (id: string) => number): number {
	let sum = 0;
	for (const other of order) {
		if (other === id) return sum;
		sum += heightOf(other);
	}
	return sum;
}

/**
 * How far each row moves for the carried card to stand where `final` puts it: the room the rows before it take in the
 * final order less the room they take now, the rows in flow one under another. `heightOf` gives a row's height.
 */
export function shiftOf(id: string, ids: readonly string[], final: readonly string[], heightOf: (id: string) => number): number {
	return topIn(final, id, heightOf) - topIn(ids, id, heightOf);
}

/**
 * The list's order once the lifted section (its header at `activeIndex` of `ids`, its rows folded away) is let go over the
 * header at `overIndex` (the design's «Поднятая секция»: it goes only between groups): carried up, before that header;
 * carried down, after that header's whole group, before the next header or at the list's end.
 */
export function sectionOrder(ids: readonly string[], sections: ReadonlySet<string>, activeIndex: number, overIndex: number): readonly string[] {
	if (overIndex < 0 || overIndex === activeIndex || !sections.has(ids[overIndex])) return ids;
	if (overIndex < activeIndex) return arrayMove([...ids], activeIndex, overIndex);
	let next = overIndex + 1;
	while (next < ids.length && !sections.has(ids[next])) next++;
	return arrayMove([...ids], activeIndex, next - 1);
}

/** The header the lifted section `id` stands before in `order`; null for the list's end. */
export function sectionBefore(order: readonly string[], sections: ReadonlySet<string>, id: string): string | null {
	return order.slice(order.indexOf(id) + 1).find((other) => sections.has(other)) ?? null;
}

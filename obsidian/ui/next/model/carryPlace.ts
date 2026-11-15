import { acceptsDrop, type GapPlace, type GroupName, levelAt, type ListCard, placeAt, type PlacedCard, type PlacedHead, placeOfDrop, placesInGap, projectsTakes, type ProjectsView, sameGap } from "../../../../core/application/contracts";
import type { BlockLists } from "./block";
import type { CarryModel, CarryTarget, MeasuredList, MeasuredRow } from "./carry";
import type { CardRow, ListModel } from "./lists";

/** How far past a place's edge the finger goes before the place flips to the other side, px (the old screen's `dropHysteresis`). */
export const DROP_HYSTERESIS = 6;

/** The same section: two gaps under one header (`sameGap` weighs a gap by its section alone at index 0). */
export function sameSection(a: GroupName, b: GroupName): boolean {
	return sameGap({ kind: "gap", index: 0, level: 0, group: a }, { kind: "gap", index: 0, level: 0, group: b });
}

/** The list a measured list draws, in the pinned lists. */
function listModelOf(lists: BlockLists, column: MeasuredList["column"]): { readonly model: ListModel; readonly grouped: boolean } | null {
	if (lists.kind === "byProject") return column === "projects" ? { model: lists.list, grouped: true } : null;
	if (lists.kind !== "rows") return null;
	const row = lists.rows.find((r) => r.column === column);
	return row ? { model: row.list, grouped: row.grouped } : null;
}

/** A card of the list as a place sees it: its task, level and section, and where it stands (content pixels). */
type Placed = ListCard & PlacedCard & { readonly row: CardRow };

/**
 * The list under the finger as the drop sees it: the cards that stay (the carried ones and their folded subtasks left
 * out), the headers, the plates, where the carried card was lifted from in it.
 */
function listAt(carry: CarryModel, list: MeasuredList, model: ListModel) {
	const boxes = new Map<string, MeasuredRow>(list.rows.map((row) => [row.key, row]));
	const away = new Set([...carry.rows, ...carry.folded]);
	const cards: Placed[] = [];
	const heads: PlacedHead[] = [];
	let home: GapPlace | null = null;
	for (const row of model.rows) {
		const box = boxes.get(row.key);
		if (!box) continue;
		if (row.kind === "card") {
			if (away.has(row.key)) {
				if (row.key === carry.id) home = { kind: "gap", index: cards.length, level: row.level, group: row.group };
				continue;
			}
			cards.push({ key: row.item.key, id: row.item.id, level: row.level, group: row.group, top: box.top, height: box.height, row });
		} else if (row.kind === "head") heads.push({ group: row.group, opens: row.opens, firstCard: cards.length, top: box.top, height: box.height });
	}
	return { cards, heads, home, boxes, waiting: boxes.get(carry.id) ?? null };
}

/**
 * What lies under the finger at (`x`, `y`), content pixels of the block's stack: the list it is over and the place a
 * drop there means, as the core's rules say (`placeAt`, `placeOfDrop`, `acceptsDrop`, `placesInGap`, `projectsTakes`),
 * against the lists as they stood at the lift and the boxes measured then. `held` is the place shown now, which keeps
 * the finger at a place's edge. Null over nothing that takes the cards.
 */
export function targetAt(carry: CarryModel, lists: BlockLists, projects: ProjectsView | null, x: number, y: number): CarryTarget | null {
	const geometry = carry.geometry;
	if (!geometry) return null;
	const list = geometry.lists.find((l) => x >= l.left && x < l.left + l.width && y >= l.top && y < l.bottom);
	if (!list) return null;
	const shown = listModelOf(lists, list.column);
	if (!shown) return null;
	const column = list.column;
	const takes = column === "projects" ? projects?.reorders === true : acceptsDrop(column, carry.origins);
	if (!takes) return null;
	const { cards, heads, home: liftedFrom, boxes, waiting } = listAt(carry, list, shown.model);
	const many = carry.ids.length > 1;
	const anywhere = column === "projects" || placesInGap(column, carry.origins.find(() => true) ?? "new", shown.grouped);
	const held = carry.target?.column === column ? carry.target.gap : liftedFrom;
	const gap: GapPlace = !anywhere
		? { kind: "gap", index: cards.length, level: 0, group: null }
		: placeAt(cards, y, levelAt(x, { left: list.left, width: list.width }, geometry.indent), 0, null, shown.grouped ? heads : [], held, DROP_HYSTERESIS);
	if (column !== "projects" && !anywhere) return { column, gap, drop: { kind: "list", column, place: null }, plate: null, line: lineOf(gap, cards, heads, list, geometry, null) };
	const asked = placeOfDrop(cards, gap, many ? null : liftedFrom);
	if (asked === null) return { column, gap, drop: null, plate: null, line: null };
	if (column === "projects" && !(projects !== null && projectsTakes(projects, carry.cards, asked))) return null;
	const plate = shown.model.rows.find((row) => row.kind === "plate" && !row.list && sameSection(row.group, gap.group) && boxes.has(row.key)) ?? null;
	const drop: CarryTarget["drop"] = column === "projects" ? { kind: "projects", place: asked } : { kind: "list", column, place: asked };
	const over = !many && liftedFrom !== null && waiting !== null && sameGap(gap, liftedFrom) ? waiting : null;
	return { column, gap, drop, plate: plate?.key ?? null, line: plate ? null : lineOf(gap, cards, heads, list, geometry, over) };
}

/**
 * The drop line through a gap (the old screen's `ListDrop.lineRect`): from the left edge of the gap's level to the
 * cards' right edge, through the middle of the gap between the cards; a card moved to another level where it stood has
 * the line over its dashed place, never on it; never higher than its dot whole under the list's top.
 */
function lineOf(gap: GapPlace, cards: readonly Placed[], heads: readonly PlacedHead[], list: MeasuredList, geometry: NonNullable<CarryModel["geometry"]>, waiting: MeasuredRow | null): CarryTarget["line"] {
	const rowBox = (card: Placed) => list.rows.find((row) => row.key === card.row.key);
	const first = cards.find(() => true);
	const firstBox = first ? rowBox(first) : undefined;
	const base = first && firstBox ? firstBox.left - first.level * geometry.indent : list.left;
	const left = base + gap.level * geometry.indent;
	const right = firstBox ? firstBox.left + firstBox.width : list.left + list.width;
	const at = cards.slice(gap.index, gap.index + 1).find(() => true);
	const prev = gap.index > 0 ? cards.slice(gap.index - 1, gap.index).find(() => true) : undefined;
	const inGroup = (card: Placed | undefined): boolean => card !== undefined && sameSection(card.group, gap.group);
	const head = [...heads].reverse().find((h) => sameSection(h.group, gap.group));
	const prevEnd = prev ? prev.top + prev.height : null;
	const top = at && inGroup(at) ? at.top : prevEnd !== null && inGroup(prev) ? prevEnd + geometry.cardGap : head ? head.top + head.height : (heads.find(() => true)?.top ?? prevEnd ?? list.top);
	if (waiting) return { left, right, y: waiting.top - geometry.cardGap / 2 };
	return { left, right, y: Math.max(top - geometry.cardGap / 2, list.top + geometry.dot / 2) };
}

/** How far past the plus's ring the finger may stand and still be over it, px (the old screen's `plusRingReach`). */
export const PLUS_RING_REACH = 24;

/** Whether the finger at (`x`, `y`) is over the plus's ring (`ring`, its box on the screen): nearer its centre than its radius and the reach. */
export function ringNear(ring: { readonly left: number; readonly top: number; readonly width: number; readonly height: number } | null, x: number, y: number): boolean {
	if (!ring) return false;
	return Math.hypot(x - (ring.left + ring.width / 2), y - (ring.top + ring.height / 2)) < ring.width / 2 + PLUS_RING_REACH;
}

/**
 * The slot nearest a lifted section's finger (`y`, content pixels of the stack; the old screen's `nearestSlot`): the
 * slots are the tops of the list's headers and its end, the lifted section's own two at the place it left, measured
 * at the lift with the section gone from the list.
 */
export function sectionSlotAt(carry: CarryModel, lists: BlockLists, y: number): number | null {
	const section = carry.section;
	const geometry = carry.geometry;
	if (!section || !geometry || lists.kind !== "rows") return null;
	const measured = geometry.lists.find((list) => list.column === section.column);
	const row = lists.rows.find((r) => r.column === section.column);
	if (!measured || !row) return null;
	const boxes = new Map(measured.rows.map((r) => [r.key, r] as const));
	const tops = row.list.rows.flatMap((r) => (r.kind === "head" ? [boxes.get(r.key)?.top ?? null] : [])).filter((top): top is number => top !== null);
	const last = measured.rows.slice(-1).find(() => true);
	const end = last ? last.top + last.height : measured.top;
	const left = [...tops, end];
	const place = (slot: number): number => left.slice(slot <= section.lifted ? slot : slot - 1).find(() => true) ?? end;
	let best = 0;
	for (let slot = 0; slot <= section.groups.length; slot++) if (Math.abs(place(slot) - y) < Math.abs(place(best) - y)) best = slot;
	return best;
}

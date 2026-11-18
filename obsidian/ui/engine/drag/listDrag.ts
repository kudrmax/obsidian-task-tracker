import { type Branch, branchAt } from "../mechanics/branches";
import { type DropCard, type DropHead, type Gap, placeOfGap, sameGap } from "../mechanics/drop";
import type { ListId, ListView, Row, Section, Target } from "../port";
import type { ScreenLooks } from "../ScreenContext";
import type { Aim, Drag, Lifted } from "./dragState";

/** A card's row as drawn: its task's row, its section's place in the list, its branch lines. */
export interface DrawnRow {
	readonly row: Row;
	readonly section: number;
	readonly branch: Branch | null;
}

/** A row of a list as drawn: a section's header, an empty section's plate, a card, the place a card was lifted from, the empty list's plate, the gap a carried thing lands in. */
export type Entry =
	| { readonly kind: "head"; readonly key: string; readonly section: Section; readonly index: number; readonly top: boolean }
	| { readonly kind: "plate"; readonly key: string; readonly section: Section }
	| { readonly kind: "card"; readonly key: string; readonly card: DrawnRow; readonly parent: boolean }
	| { readonly kind: "home"; readonly key: string; readonly depth: number }
	| { readonly kind: "empty"; readonly key: string; readonly words: string }
	| { readonly kind: "gap"; readonly key: string; readonly depth: number; readonly id: string | null; readonly section: boolean };

/** A list's cards in drawn order, those in `without` left out: each with its section's place and its depth. */
export function rowsOf(list: ListView, without: ReadonlySet<string> = new Set()): DrawnRow[] {
	const rows = list.sections.flatMap((section, at) => section.rows.filter((row) => !without.has(row.id)).map((row) => ({ row, section: at })));
	const depths = rows.map(({ row }) => row.depth);
	return rows.map((row, i) => ({ ...row, branch: branchAt(depths, i) }));
}

/** The key of a carried task's gap: its card's own, so the card takes the gap's row once dropped and glides from there. */
const taskKey = (id: string) => `task:${id}`;
const headKey = (id: string) => `head:${id}`;

/**
 * The rows a list draws while `drag` is under way (none: as it reads): the carried task and its subtasks leave it; the gap
 * opens where the aim is in this list, else where the card was lifted (a refused place or the timeline opens none there).
 * Until the drop is over the list stands as during the carry, so the copy flies into the gap; then the card takes the gap's row.
 */
export function entriesOf(list: ListView, id: ListId | null, drag: Drag | null, looks: Pick<ScreenLooks, "homePlace" | "parentOutline">): Entry[] {
	if (drag?.lifted.kind === "section" && drag.lifted.list === id) return sectionEntries(list, drag);
	const lifted = drag?.lifted.kind === "task" ? drag.lifted : null;
	const carried = new Set(lifted?.ids ?? []);
	const home = lifted?.home?.list === id && id !== null ? lifted.home.gap : null;
	const aimed = drag?.aim.kind === "gap" ? (drag.aim.list === id ? drag.aim.gap : null) : home;
	const gap = lifted ? aimed : null;
	const homeOutline = lifted && looks.homePlace === "outline" && home && !(gap && sameGap(gap, home)) ? home : null;
	const rows = rowsOf(list, carried);
	const entries: Entry[] = [];
	let placed = false;
	let parentAt = -1;
	const openGap = (g: Gap) => {
		if (placed) return;
		placed = true;
		if (looks.parentOutline && g.depth > 0) parentAt = parentOf(entries, g.depth);
		entries.push({ kind: "gap", key: lifted ? taskKey(lifted.id) : "gap", depth: g.depth, id: lifted?.id ?? null, section: false });
	};
	let at = 0;
	list.sections.forEach((section, s) => {
		if (section.header) entries.push({ kind: "head", key: headKey(section.id), section, index: s, top: entries.length === 0 });
		const gapHere = gap !== null && gap.section === s;
		const left = rows.filter((row) => row.section === s);
		if (section.empty && !gapHere) entries.push({ kind: "plate", key: `plate:${section.id}`, section });
		for (const card of left) {
			if (homeOutline && homeOutline.section === s && at === homeOutline.index) entries.push({ kind: "home", key: "home", depth: homeOutline.depth });
			if (gapHere && at === gap.index) openGap(gap);
			entries.push({ kind: "card", key: taskKey(card.row.id), card, parent: false });
			at++;
		}
		if (homeOutline && homeOutline.section === s && at === homeOutline.index && !entries.some((e) => e.kind === "home")) entries.push({ kind: "home", key: "home", depth: homeOutline.depth });
		if (gapHere) openGap(gap);
	});
	if (gap) openGap(gap);
	if (list.plate !== null && !placed) entries.push({ kind: "empty", key: "empty", words: list.plate });
	const parent = entries[parentAt];
	if (parent?.kind === "card") entries[parentAt] = { ...parent, parent: true };
	return entries;
}

/** The card a gap at `depth` would go under: the nearest drawn card above it a level up. */
function parentOf(entries: readonly Entry[], depth: number): number {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.kind === "card" && entry.card.row.depth === depth - 1) return i;
	}
	return -1;
}

/** A list while one of its sections is carried: the section leaves it, the gap between the sections opens at the aim, first where it stood. */
function sectionEntries(list: ListView, drag: Drag): Entry[] {
	const lifted = drag.lifted;
	if (lifted.kind !== "section") return [];
	const slot = drag.aim.kind === "slot" ? drag.aim.slot : lifted.home;
	const rows = rowsOf(list);
	const entries: Entry[] = [];
	let at = 0;
	const gap = () => entries.push({ kind: "gap", key: headKey(lifted.section), depth: 0, id: null, section: true });
	list.sections.forEach((section, s) => {
		if (section.id === lifted.section) return;
		if (at === slot) gap();
		at++;
		if (section.header) entries.push({ kind: "head", key: headKey(section.id), section, index: s, top: entries.length === 0 });
		if (section.empty) entries.push({ kind: "plate", key: `plate:${section.id}`, section });
		for (const card of rows.filter((row) => row.section === s)) entries.push({ kind: "card", key: taskKey(card.row.id), card, parent: false });
	});
	if (at <= slot) gap();
	return entries;
}

/** A drawn row's box along the list, as the virtualizer measured it. */
export interface Measured {
	readonly index: number;
	readonly start: number;
	readonly size: number;
}

/** The cards and headers where they would stand with the gap closed: what the drop's geometry reads. */
export function placedOf(entries: readonly Entry[], measured: readonly Measured[], gapStep: number): { readonly cards: DropCard[]; readonly heads: DropHead[] } {
	const box = new Map(measured.map((m) => [m.index, m]));
	const gapAt = entries.findIndex((entry) => entry.kind === "gap");
	const shift = gapAt >= 0 ? (box.get(gapAt)?.size ?? 0) + gapStep : 0;
	const cards: DropCard[] = [];
	const heads: DropHead[] = [];
	entries.forEach((entry, i) => {
		const m = box.get(i);
		if (!m) return;
		const top = m.start - (gapAt >= 0 && i > gapAt ? shift : 0);
		if (entry.kind === "card") cards.push({ id: entry.card.row.id, depth: entry.card.row.depth, section: entry.card.section, top, height: m.size });
		else if (entry.kind === "head") heads.push({ section: entry.index, firstCard: cards.length, top, height: m.size });
	});
	return { cards, heads };
}

/** A list's cards as a drop sees them without their boxes, the carried ones left out. */
export function dropCards(list: ListView, without: ReadonlySet<string>): DropCard[] {
	return rowsOf(list, without).map(({ row, section }) => ({ id: row.id, depth: row.depth, section, top: 0, height: 0 }));
}

/** A task's card lifted from its list: with every subtask under it, its place there as the gap it leaves. */
export function liftCard(list: ListView, id: ListId, task: string, layers: number): Lifted | null {
	const rows = rowsOf(list);
	const at = rows.findIndex(({ row }) => row.id === task);
	if (at < 0) return null;
	const { row, section } = rows[at];
	let end = at + 1;
	while (end < rows.length && rows[end].section === section && rows[end].row.depth > row.depth) end++;
	const ids = rows.slice(at, end).map(({ row: r }) => r.id);
	return { kind: "task", id: task, ids, home: { list: id, gap: { index: at, depth: row.depth, section } }, layers: ids.length > 1 ? layers : 0 };
}

/** What letting go at `aim` writes; null where it changes nothing (the card's own place, or nowhere). */
export function targetOf(lifted: Lifted, aim: Aim, lists: Readonly<Record<ListId, ListView>>): Target | null {
	if (lifted.kind !== "task") return null;
	if (aim.kind === "time") return { kind: "time", minute: aim.minute };
	if (aim.kind === "title") return { kind: "title", list: aim.list };
	if (aim.kind !== "gap") return null;
	const home = lifted.home;
	if (home && home.list === aim.list && sameGap(home.gap, aim.gap) && home.gap.depth === aim.gap.depth) return null;
	const list = lists[aim.list];
	const place = placeOfGap(dropCards(list, new Set(lifted.ids)), aim.gap);
	const section = list.sections[place.section];
	if (!section) return null;
	return { kind: "place", place: { list: aim.list, section: section.id, parent: place.parent, before: place.before } };
}

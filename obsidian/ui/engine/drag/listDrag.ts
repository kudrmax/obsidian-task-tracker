import { type GapPlace, type ListCard, type PlacedCard, type PlacedHead, sameGap, type TaskItem } from "../../../../core/application/contracts";
import type { ColumnModel, GroupModel, RowModel } from "../columnModel";
import type { ScreenLooks } from "../ScreenContext";
import type { Drag } from "./dragState";

/** A row of a list as drawn and counted: a section's header, its No tasks plate, a card, the empty list's plate, the gap a carried card will land in. */
export type Entry =
	| { readonly key: string; readonly kind: "head"; readonly group: GroupModel; readonly top: boolean }
	| { readonly kind: "plate"; readonly key: string; readonly group: GroupModel }
	| { readonly kind: "card"; readonly key: string; readonly row: RowModel; readonly group: GroupModel; readonly parent: boolean }
	| { readonly kind: "home"; readonly key: string; readonly level: number }
	| { readonly kind: "empty"; readonly key: string; readonly words: string }
	| { readonly kind: "gap"; readonly key: string; readonly level: number; readonly id: string | null; readonly section?: boolean };

/** The key of a gap for no task (the plus): a carried task's gap is keyed as its card, so the card takes its row after the drop. */
export const GAP_KEY = "gap";

/**
 * The rows a list draws, from its model and the drag under way: the carried task and its subtasks leave it; the gap
 * opens where the core placed the carried card (`placeAt`), at its depth, in place of an empty section's plate.
 */
export function entriesOf(model: ColumnModel, column: string, drag: Drag | null, looks: Pick<ScreenLooks, "homePlace" | "parentOutline">): Entry[] {
	if (drag?.lifted.kind === "section" && drag.lifted.column === column) return sectionEntries(model, drag);
	const lifted = drag?.lifted.kind === "task" ? new Set(drag.lifted.ids) : null;
	/**
	 * Until the drop is over (its screen drawn, its copy landed) the list stands as during the carry: the gap open where the
	 * copy flies, the carried task out of it. Then the card takes the gap's row (the same row, keyed by the task) and glides
	 * to where it stands, with every card the drop moved.
	 */
	const carrying = drag !== null;
	const aim = carrying ? drag.aim : null;
	const home = drag?.lifted.kind === "task" ? drag.lifted.home : null;
	/** Where the gap stands in this list: the aim's, else (aiming nowhere new, or refused) the card's own place. */
	const gap: GapPlace | null = !carrying ? null : aim?.kind === "gap" ? (aim.column === column ? aim.gap : null) : home?.column === column ? home.gap : null;
	const gapId = drag?.lifted.kind === "task" ? drag.lifted.id : null;
	/** The card's own place, outlined while the gap is elsewhere (the released look; stage 0 lets it close). */
	const homeGap = carrying && looks.homePlace === "outline" && home?.column === column && !(gap && sameGap(gap, home.gap)) ? home.gap : null;
	/** The drawn group each place's section is (the core names a section by its name, the list draws it once). */
	const drawnAt = new Map(model.groups.map((group, i) => [group.name, i]));
	const gapGroup = gap ? drawnAt.get(gap.group) : undefined;
	const homeGroup = homeGap ? drawnAt.get(homeGap.group) : undefined;
	/** The card the carried one would go under, outlined (a look to choose): the nearest card above the gap a level up. */
	let parentAt = -1;
	const entries: Entry[] = [];
	let cards = 0;
	let placed = false;
	const openGap = () => {
		if (placed || !gap) return;
		placed = true;
		entries.push({ key: gapId ? `task:${gapId}` : GAP_KEY, kind: "gap", level: gap.level, id: gapId });
	};
	model.groups.forEach((group, at) => {
		if (group.header) entries.push({ key: `head:${group.id}`, kind: "head", group, top: entries.length === 0 });
		const gapHere = gap !== null && gapGroup === at;
		const homeHere = homeGap !== null && homeGroup === at;
		if (group.empty && !gapHere) entries.push({ key: `plate:${group.id}`, kind: "plate", group });
		for (const row of group.rows) {
			if (carrying && lifted?.has(row.id)) continue;
			if (homeHere && cards === homeGap.index) entries.push({ key: "home", kind: "home", level: homeGap.level });
			if (gapHere && cards === gap.index) {
				if (looks.parentOutline && gap.level > 0) parentAt = parentOf(entries, gap.level);
				openGap();
			}
			entries.push({ key: `task:${row.id}`, kind: "card", row, group, parent: false });
			cards++;
		}
		if (homeHere && cards === homeGap.index && !entries.some((entry) => entry.kind === "home")) entries.push({ key: "home", kind: "home", level: homeGap.level });
		if (gapHere && !placed && looks.parentOutline && gap.level > 0) parentAt = parentOf(entries, gap.level);
		if (gapHere) openGap();
	});
	openGap();
	if (model.plate !== null && !placed) entries.push({ key: "empty", kind: "empty", words: model.plate });
	if (parentAt >= 0) {
		const card = entries[parentAt];
		if (card.kind === "card") entries[parentAt] = { ...card, parent: true };
	}
	return entries;
}

/** The key of the gap a carried section will land in: the section's own, so its header takes the gap's row after the drop. */
export const sectionKey = (groupId: string) => `head:${groupId}`;

/**
 * A list while one of its sections is carried: the section's header and cards leave it; the gap between the sections
 * opens where the finger is (`slot`, among the sections left), first where the section stood.
 */
function sectionEntries(model: ColumnModel, drag: Drag): Entry[] {
	const lifted = drag.lifted;
	if (lifted.kind !== "section") return [];
	const slot = drag.aim.kind === "slot" ? drag.aim.slot : lifted.home;
	const entries: Entry[] = [];
	let at = 0;
	const gap = () => entries.push({ key: sectionKey(lifted.groupId), kind: "gap", level: 0, id: null, section: true });
	for (const group of model.groups) {
		if (group.id === lifted.groupId) continue;
		if (at === slot) gap();
		at++;
		if (group.header) entries.push({ key: `head:${group.id}`, kind: "head", group, top: entries.length === 0 });
		if (group.empty) entries.push({ key: `plate:${group.id}`, kind: "plate", group });
		for (const row of group.rows) entries.push({ key: `task:${row.id}`, kind: "card", row, group, parent: false });
	}
	if (at <= slot) gap();
	return entries;
}

/** Where a carried section would land: among the sections left, the gap before the first whose header's middle is below `y`. */
export function sectionSlotAt(entries: readonly Entry[], measured: readonly Measured[], y: number): number {
	const box = new Map(measured.map((m) => [m.index, m]));
	return entries.filter((entry, i) => entry.kind === "head" && (box.get(i)?.start ?? Infinity) + (box.get(i)?.size ?? 0) / 2 < y).length;
}

/** The entry of the card a gap at `level` would go under: the nearest card above it a level up. */
function parentOf(entries: readonly Entry[], level: number): number {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.kind === "card" && entry.row.level === level - 1) return i;
	}
	return -1;
}

/** The cards of a list as the core's places see them, the carried ones left out: each with its task and its section. */
export function listCards(model: ColumnModel, items: Readonly<Record<string, TaskItem>>, without: ReadonlySet<string>): ListCard[] {
	return model.groups.flatMap((group) => group.rows.filter((row) => !without.has(row.id) && items[row.id]).map((row) => ({ key: items[row.id].key, id: row.id, level: row.level, group: group.name })));
}

/** A drawn row's box along the list, as the virtualizer measured it. */
export interface Measured {
	readonly index: number;
	readonly start: number;
	readonly size: number;
}

/**
 * The cards and headers where they stand with the gap closed, from the drawn rows' boxes: what `placeAt` reads, the gap it
 * was told of (`room`) and its height (`shift`) given apart. Rows after the gap stand that much higher without it.
 */
export function placedOf(entries: readonly Entry[], measured: readonly Measured[], gapStep: number): { readonly cards: PlacedCard[]; readonly heads: PlacedHead[]; readonly shift: number } {
	const box = new Map(measured.map((m) => [m.index, m]));
	const gapAt = entries.findIndex((entry) => entry.kind === "gap");
	const shift = gapAt >= 0 ? (box.get(gapAt)?.size ?? 0) + gapStep : 0;
	const cards: PlacedCard[] = [];
	const heads: PlacedHead[] = [];
	entries.forEach((entry, i) => {
		const m = box.get(i);
		if (!m) return;
		const top = m.start - (gapAt >= 0 && i > gapAt ? shift : 0);
		if (entry.kind === "card") cards.push({ level: entry.row.level, group: entry.group.name, top, height: m.size });
		else if (entry.kind === "head") heads.push({ group: entry.group.name, firstCard: cards.length, top, height: m.size });
	});
	return { cards, heads, shift };
}

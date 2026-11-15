import { describe, expect, it } from "vitest";
import { type BlockLists, type BlockModel, currentLists, projectsView } from "../../../obsidian/ui/next/model/block";
import type { CarryGeometry, MeasuredList } from "../../../obsidian/ui/next/model/carry";
import { ringNear, sectionSlotAt, targetAt } from "../../../obsidian/ui/next/model/carryPlace";
import { dropLine, rowMarks } from "../../../obsidian/ui/next/model/carryView";
import type { CardRow, HeadRow } from "../../../obsidian/ui/next/model/lists";
import { listsOf, PLUS_ANCHOR } from "../../../obsidian/ui/next/update/carry";
import { itemOf } from "../../runtime/harness";
import { noteModel, pass, projectHarness } from "./blockHarness";

const CARD = 35;
const GAP = 2;
const HEAD = 26;

/** The lists laid out as the stylesheet lays them: stacked rows, a card 35 px, a header 26 px, a 2 px gap, one column 300 px wide. */
function geometryOf(lists: BlockLists): CarryGeometry {
	let top = 0;
	const measured: MeasuredList[] = listsOf(lists).map(({ column, list }) => {
		const start = top;
		const rows = list.rows.map((row) => {
			const height = row.kind === "head" ? HEAD : CARD;
			const box = { key: row.key, top, height, left: 0, width: 300 };
			top += height + GAP;
			return box;
		});
		const out = { column, left: 0, width: 300, top: start, bottom: Math.max(top, start + CARD), rows };
		top += 40;
		return out;
	});
	return { lists: measured, indent: 20, cardHeight: CARD, cardGap: GAP, dot: 8 };
}

const plusBox = { left: 250, top: 600, width: 44, height: 44 };
const headBox = { left: 0, top: 0, width: 300, height: HEAD };

type Harness = Awaited<ReturnType<typeof projectHarness>>;

function dayRows(model: BlockModel) {
	return listsOf(currentLists(model)).find((l) => l.column === "day")!.list.rows;
}

function heads(model: BlockModel): HeadRow[] {
	return dayRows(model).filter((r): r is HeadRow => r.kind === "head");
}

function cardTop(model: BlockModel, title: string): number {
	const key = listsOf(currentLists(model))
		.flatMap(({ list }) => list.rows)
		.find((r): r is CardRow => r.kind === "card" && r.item.title === title)!.key;
	return model.carry!.geometry!.lists.flatMap((l) => l.rows).find((r) => r.key === key)!.top;
}

/** The plus carried off its place, the geometry handed in as the host does after the lift's render. */
function plusLifted(h: Harness) {
	const out = pass(h, noteModel(h), { kind: "carry", msg: { kind: "liftPlus", at: { x: 270, y: 620 }, box: plusBox } });
	const model = pass(h, out.model, { kind: "carry", msg: { kind: "measured", geometry: geometryOf(out.model.pinned!) } }).model;
	return { model, out };
}

/** The section of that name lifted by its header. */
function sectionLifted(h: Harness, name: string) {
	const head = heads(noteModel(h)).find((r) => r.name === name)!;
	const out = pass(h, noteModel(h), { kind: "carry", msg: { kind: "liftSection", key: head.key, at: { x: 10, y: 10 }, box: headBox } });
	const model = pass(h, out.model, { kind: "carry", msg: { kind: "measured", geometry: geometryOf(out.model.pinned!) } }).model;
	return { model, out, head };
}

function headNames(model: BlockModel): string[] {
	return heads(model).map((r) => r.name);
}

describe("the plus carried (the old block's PlusButton, PlusFloat, PlusRing)", () => {
	it("lifts a new task's float with a haptic, measures the lists and starts no carry in the core", async () => {
		const h = await projectHarness();
		const { model, out } = plusLifted(h);
		expect(out.doors).toEqual([]);
		expect(out.effects.map((e) => e.kind)).toEqual(["haptic", "measureCarry"]);
		expect(model.carry?.kind).toBe("plus");
		expect(model.carry?.origins).toEqual(["new"]);
		expect(model.carry?.cards).toEqual([]);
		expect(h.runtime.replica.state.projectsScreen.carry).toBeUndefined();
	});

	it("lets go in a gap: the field opens where it was dropped (entry.openAtDrop) and the float flies into it", async () => {
		const h = await projectHarness();
		let { model } = plusLifted(h);
		const target = targetAt(model.carry!, model.pinned!, projectsView(model), 150, cardTop(model, "Call the bank") + CARD - 2);
		expect(target?.drop?.kind).toBe("list");
		model = pass(h, model, { kind: "carry", msg: { kind: "over", target, ring: false } }).model;
		const out = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(out.doors).toEqual([]);
		const call = out.effects.find((e) => e.kind === "entryCall");
		expect(call).toMatchObject({ method: "entry.openAtDrop", args: [target!.column, { kind: "place", column: target!.column, place: (target!.drop as { place: unknown }).place }] });
		expect(out.model.pinned).toBeNull();
		expect(out.model.carry?.phase).toBe("landing");
		expect(out.model.carry?.lands).toBe(out.model.entry!.field);
		expect(out.effects.find((e) => e.kind === "fly")).toMatchObject({ kind: "fly", to: out.model.entry!.field, later: true });
		expect(pass(h, out.model, { kind: "carry", msg: { kind: "landed" } }).model.carry).toBeNull();
	});

	it("goes back to the plus when let go nowhere, and when let go on its ring", async () => {
		const h = await projectHarness();
		const { model } = plusLifted(h);
		const nowhere = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(nowhere.doors).toEqual([]);
		expect(nowhere.model.carry?.phase).toBe("returning");
		expect(nowhere.effects).toEqual([{ kind: "fly", to: PLUS_ANCHOR, done: { kind: "carry", msg: { kind: "landed" } } }]);
		const target = targetAt(model.carry!, model.pinned!, projectsView(model), 150, cardTop(model, "Call the bank") + CARD - 2);
		const ringed = pass(h, model, { kind: "carry", msg: { kind: "over", target, ring: true } }).model;
		expect(ringed.carry?.ring).toBe(true);
		const onRing = pass(h, ringed, { kind: "carry", msg: { kind: "drop" } });
		expect(onRing.doors).toEqual([]);
		expect(onRing.model.carry?.phase).toBe("returning");
		expect(onRing.model.entry?.state ?? null).toBeNull();
	});

	it("reads the ring as hot within its reach (its radius and 24 px), cold past it", () => {
		expect(ringNear(plusBox, 272, 622)).toBe(true);
		expect(ringNear(plusBox, 272 + 22 + 23, 622)).toBe(true);
		expect(ringNear(plusBox, 272 + 22 + 25, 622)).toBe(false);
	});
});

describe("a section lifted by its header (the old block's GroupDrag)", () => {
	it("lifts the section with its cards, which wait where they stand: nothing under it moves (P6), no core carry", async () => {
		const h = await projectHarness();
		const { model, out, head } = sectionLifted(h, "Errands");
		expect(out.doors).toEqual([]);
		expect(out.effects.map((e) => e.kind)).toEqual(["haptic", "measureCarry"]);
		expect(model.carry?.kind).toBe("section");
		expect(model.carry?.section).toMatchObject({ name: "Errands", count: 1, lifted: 1, gap: 1 });
		const pinnedDay = listsOf(model.pinned!).find((l) => l.column === "day")!.list.rows.map((r) => r.key);
		expect(pinnedDay).toContain(head.key);
		const waiting = rowMarks(model).waiting;
		expect(waiting.has(head.key)).toBe(true);
		expect(model.carry?.section?.rows.every((key) => waiting.has(key) && pinnedDay.includes(key))).toBe(true);
		expect(model.carry?.section?.rows.length).toBe(2);
	});

	it("reads the nearest slot from the headers' places, its own slots drawing no landing", async () => {
		const h = await projectHarness();
		const { model } = sectionLifted(h, "Errands");
		const day = model.carry!.geometry!.lists.find((l) => l.column === "day")!;
		expect(sectionSlotAt(model.carry!, model.pinned!, day.rows[0].top)).toBe(0);
		/** Below the last section the end is its own place: the slot nearest is its own, nothing drawn. */
		const last = day.rows[day.rows.length - 1];
		expect(sectionSlotAt(model.carry!, model.pinned!, last.top + last.height + 40)).toBe(2);
		const top = pass(h, model, { kind: "carry", msg: { kind: "slot", gap: 0 } }).model;
		/** The landing is a drop line over the first header, as a carried card's: it takes no room, so no row moves. */
		expect(dropLine(top)).toEqual({ x: day.left, y: day.rows[0].top, width: day.width });
		expect(top.motion).toEqual(model.motion);
		const own = pass(h, model, { kind: "carry", msg: { kind: "slot", gap: 2 } }).model;
		expect(dropLine(own)).toBeNull();
	});

	it("moves the section where it was let go (tasks.moveGroup) and folds the float onto its header", async () => {
		const h = await projectHarness();
		let { model, head } = sectionLifted(h, "Errands");
		model = pass(h, model, { kind: "carry", msg: { kind: "slot", gap: 0 } }).model;
		const out = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(out.doors).toEqual(["tasks.moveGroup"]);
		expect(out.effects.map((e) => e.kind)).toEqual(["haptic", "fly"]);
		expect(out.effects[1]).toMatchObject({ to: head.key, later: true });
		expect(out.model.pinned).toBeNull();
		expect(headNames(out.model)).toEqual(["Errands", "No section"]);
		expect(h.vault.text("TODOs Tasks.md")).toBeDefined();
	});

	it("moves No section too, to the end", async () => {
		const h = await projectHarness();
		let { model } = sectionLifted(h, "No section");
		model = pass(h, model, { kind: "carry", msg: { kind: "slot", gap: 2 } }).model;
		const out = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(out.doors).toEqual(["tasks.moveGroup"]);
		expect(headNames(out.model)).toEqual(["Errands", "No section"]);
	});

	it("goes back onto its header, writing nothing, when let go on its own place", async () => {
		const h = await projectHarness();
		const { model, head } = sectionLifted(h, "Errands");
		const out = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(out.doors).toEqual([]);
		expect(out.model.carry?.phase).toBe("returning");
		expect(out.effects).toEqual([{ kind: "fly", to: head.key, later: true, done: { kind: "carry", msg: { kind: "landed" } } }]);
		expect(headNames(out.model)).toEqual(["No section", "Errands"]);
	});
});

describe("a section's header tapped (the old block's GroupMenu)", () => {
	it("opens its menu with Rename and Remove section as the core offers them; none on No section", async () => {
		const h = await projectHarness();
		const model = noteModel(h);
		const [none, errands] = heads(model);
		const out = pass(h, model, { kind: "section", msg: { kind: "menu", head: errands.key } }).model;
		expect(out.layers[out.layers.length - 1]).toMatchObject({ kind: "sectionMenu", section: "Errands", rename: true, remove: true, head: errands.key });
		expect(pass(h, model, { kind: "section", msg: { kind: "menu", head: none.key } }).model.layers).toEqual(model.layers);
	});

	it("renames in place: the field on the header, Enter writes the name (tasks.renameGroup)", async () => {
		const h = await projectHarness();
		let model = noteModel(h);
		const errands = heads(model)[1];
		model = pass(h, model, { kind: "section", msg: { kind: "menu", head: errands.key } }).model;
		const renaming = pass(h, model, { kind: "section", msg: { kind: "rename" } });
		expect(renaming.model.sectionRename).toMatchObject({ head: errands.key, name: "Errands" });
		expect(renaming.effects.some((e) => e.kind === "focus")).toBe(true);
		const named = pass(h, renaming.model, { kind: "section", msg: { kind: "named", text: "Shops" } });
		expect(named.doors).toEqual(["sectionName.end", "tasks.renameGroup"]);
		expect(named.model.sectionRename).toBeNull();
		expect(headNames(named.model)).toEqual(["No section", "Shops"]);
	});

	it("keeps the old name on Escape or a tap elsewhere", async () => {
		const h = await projectHarness();
		let model = noteModel(h);
		model = pass(h, model, { kind: "section", msg: { kind: "menu", head: heads(model)[1].key } }).model;
		model = pass(h, model, { kind: "section", msg: { kind: "rename" } }).model;
		const out = pass(h, model, { kind: "section", msg: { kind: "unnamed" } });
		expect(out.doors.filter((d) => d === "tasks.renameGroup")).toEqual([]);
		expect(out.model.sectionRename).toBeNull();
		expect(headNames(out.model)).toEqual(["No section", "Errands"]);
	});

	it("removes the section, its tasks joining No section (tasks.removeGroup)", async () => {
		const h = await projectHarness();
		let model = noteModel(h);
		model = pass(h, model, { kind: "section", msg: { kind: "menu", head: heads(model)[1].key } }).model;
		const out = pass(h, model, { kind: "section", msg: { kind: "remove" } });
		expect(out.doors).toEqual(["tasks.removeGroup"]);
		expect(headNames(out.model)).not.toContain("Errands");
		expect(itemOf(h.runtime, "Shop")).toBeDefined();
	});
});

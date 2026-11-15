import { describe, expect, it } from "vitest";
import { type BlockLists, type BlockModel, currentLists, projectsView } from "../../../obsidian/ui/next/model/block";
import type { CarryGeometry, MeasuredList } from "../../../obsidian/ui/next/model/carry";
import { targetAt } from "../../../obsidian/ui/next/model/carryPlace";
import { rowMarks } from "../../../obsidian/ui/next/model/carryView";
import type { CardRow } from "../../../obsidian/ui/next/model/lists";
import { listsOf } from "../../../obsidian/ui/next/update/carry";
import { settle } from "../../runtime/harness";
import { noteModel, pass, projectHarness } from "./blockHarness";

const CARD = 35;
const GAP = 2;
const HEAD = 26;

/** The lists laid out as the stylesheet lays them: stacked rows, every card 35 px with a 2 px gap, a header 26 px, in one column 300 px wide. */
function geometryOf(lists: BlockLists): CarryGeometry {
	let top = 0;
	const measured: MeasuredList[] = listsOf(lists).map(({ column, list }) => {
		const start = top;
		const rows = list.rows.map((row) => {
			const height = row.kind === "head" ? HEAD : CARD;
			const level = row.kind === "card" ? row.level : 0;
			const box = { key: row.key, top, height, left: level * 20, width: 300 - level * 20 };
			top += height + GAP;
			return box;
		});
		const list0 = { column, left: 0, width: 300, top: start, bottom: Math.max(top, start + CARD), rows };
		top += 40;
		return list0;
	});
	return { lists: measured, indent: 20, cardHeight: CARD, cardGap: GAP, dot: 8 };
}

const box = { left: 0, top: 0, width: 300, height: CARD };

function cardKey(model: BlockModel, title: string): string {
	for (const { list } of listsOf(currentLists(model))) {
		const row = list.rows.find((r): r is CardRow => r.kind === "card" && r.item.title === title);
		if (row) return row.key;
	}
	throw new Error(`no card ${title}`);
}

/** A card lifted under the mouse and the geometry handed in, as the host does after the lift's render. */
function lifted(h: Awaited<ReturnType<typeof projectHarness>>, title: string) {
	let model = noteModel(h);
	const key = cardKey(model, title);
	const out = pass(h, model, { kind: "carry", msg: { kind: "lift", key, at: { x: 10, y: 10 }, box } });
	model = out.model;
	expect(out.effects.map((e) => e.kind)).toEqual(["haptic", "measureCarry"]);
	model = pass(h, model, { kind: "carry", msg: { kind: "measured", geometry: geometryOf(model.pinned!) } }).model;
	return { model, key, doors: out.doors };
}

/** Where a list's row stands in the geometry. */
function rowTop(model: BlockModel, key: string): number {
	return model.carry!.geometry!.lists.flatMap((l) => l.rows).find((r) => r.key === key)!.top;
}

describe("the carry in the block (P6, inventory A4, A6)", () => {
	it("starts the core's carry and pins the lists, the card waiting, its subtasks folded away", async () => {
		const h = await projectHarness();
		const { model, key, doors } = lifted(h, "Parent");
		expect(doors).toEqual(["tasks.startCarry"]);
		expect(h.runtime.replica.state.projectsScreen.carry).toBeDefined();
		const child = cardKey(noteModel(h), "Child");
		expect(model.carry!.folded).toEqual([child]);
		const pinnedKeys = listsOf(model.pinned!).flatMap(({ list }) => list.rows.map((r) => r.key));
		expect(pinnedKeys).not.toContain(child);
		expect(pinnedKeys).toContain(key);
		expect(rowMarks(model).waiting).toEqual(new Set([key]));
	});

	it("reads the place under the finger from the geometry, a line in the gap, nothing over its own place", async () => {
		const h = await projectHarness();
		const { model, key } = lifted(h, "Idea");
		const callTop = rowTop(model, cardKey(model, "Call the bank"));
		const home = targetAt(model.carry!, model.pinned!, projectsView(model), 150, rowTop(model, key) + CARD / 2);
		expect(home?.drop).toBeNull();
		const below = targetAt(model.carry!, model.pinned!, projectsView(model), 150, callTop + CARD - 2);
		expect(below?.column).toBe("inbox");
		expect(below?.drop?.kind).toBe("list");
		expect(below?.line).not.toBeNull();
		expect(targetAt(model.carry!, model.pinned!, projectsView(model), 900, callTop)).toBeNull();
	});

	it("drops where the target says (tasks.drop), ends the carry, and flies the float to the card where it lands", async () => {
		const h = await projectHarness();
		let { model } = lifted(h, "Idea");
		const callTop = rowTop(model, cardKey(model, "Call the bank"));
		const target = targetAt(model.carry!, model.pinned!, projectsView(model), 150, callTop + CARD - 2);
		model = pass(h, model, { kind: "carry", msg: { kind: "over", target } }).model;
		const out = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(out.doors).toEqual(["tasks.drop", "tasks.endCarry"]);
		expect(out.effects.map((e) => e.kind)).toEqual(["haptic", "fly"]);
		expect(out.model.pinned).toBeNull();
		expect(out.model.carry?.phase).toBe("landing");
		expect(h.runtime.replica.state.projectsScreen.carry).toBeUndefined();
		const inbox = listsOf(currentLists(out.model)).find((l) => l.column === "inbox")!.list.rows.flatMap((r) => (r.kind === "card" ? [r.item.title] : []));
		expect(inbox).toEqual(["Call the bank", "Idea"]);
		expect(rowMarks(out.model).arriving).toBe(out.model.carry!.lands);
		const landed = pass(h, out.model, { kind: "carry", msg: { kind: "landed" } }).model;
		expect(landed.carry).toBeNull();
	});

	it("tells the core only when the target changed: carryAt is never called in a block (it has no tree)", async () => {
		const h = await projectHarness();
		const { model } = lifted(h, "Idea");
		const out = pass(h, model, { kind: "carry", msg: { kind: "over", target: null } });
		expect(out.doors).toEqual([]);
	});

	it("flies back and lets the carry go nowhere when let go off any place", async () => {
		const h = await projectHarness();
		const { model, key } = lifted(h, "Shop");
		const out = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(out.doors).toEqual(["tasks.endCarry"]);
		expect(out.effects).toEqual([{ kind: "fly", to: key, done: { kind: "carry", msg: { kind: "landed" } } }]);
		expect(out.model.carry?.phase).toBe("returning");
		expect(out.model.pinned).not.toBeNull();
	});

	it("fades the float and ends the carry when the carried task leaves the file (Sync)", async () => {
		const h = await projectHarness();
		const { model } = lifted(h, "Idea");
		await settle(h.runtime);
		h.vault.outside("TODOs Tasks.md", h.vault.text("TODOs Tasks.md")!.replace(/^- \[ \] Idea.*\n/m, ""));
		await settle(h.runtime);
		const out = pass(h, model, { kind: "views", answers: model.answers });
		expect(out.model.carry?.phase).toBe("gone");
		expect(out.effects.some((e) => e.kind === "fly" && e.to === null)).toBe(true);
		expect(out.doors).toContain("tasks.endCarry");
	});

	it("keeps the lists pinned while the file changes elsewhere under a carry, the card's place still waiting", async () => {
		const h = await projectHarness();
		const { model } = lifted(h, "Idea");
		await settle(h.runtime);
		h.vault.outside("TODOs Tasks.md", `${h.vault.text("TODOs Tasks.md")}\n`.replace("- [ ] Call the bank", "- [ ] Call the bank again"));
		await settle(h.runtime);
		const out = pass(h, model, { kind: "views", answers: model.answers });
		expect(out.model.pinned).toBe(model.pinned);
		expect(out.model.carry?.phase).toBe("carried");
	});

});

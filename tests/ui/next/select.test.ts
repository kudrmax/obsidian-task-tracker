import { describe, expect, it } from "vitest";
import { type BlockModel, currentLists, projectsView } from "../../../obsidian/ui/next/model/block";
import { targetAt } from "../../../obsidian/ui/next/model/carryPlace";
import { rowMarks } from "../../../obsidian/ui/next/model/carryView";
import type { CardRow } from "../../../obsidian/ui/next/model/lists";
import { listsOf } from "../../../obsidian/ui/next/update/carry";
import { noteModel, pass, projectHarness } from "./blockHarness";

function keyOf(model: BlockModel, title: string): string {
	for (const { list } of listsOf(currentLists(model))) {
		const row = list.rows.find((r): r is CardRow => r.kind === "card" && r.item.title === title);
		if (row) return row.key;
	}
	throw new Error(`no card ${title}`);
}

const tap = (key: string, mod = false, shift = false) => ({ kind: "carry" as const, msg: { kind: "tap" as const, key, act: "card", mod, shift } });

/** A carry of a day's card and an Inbox card: Inbox takes no day's card (`acceptsDrop`), so nothing there takes them. */
function refusedWith(model: BlockModel) {
	const geometry = { lists: [{ column: "inbox" as const, left: 0, width: 300, top: 0, bottom: 74, rows: [] }], indent: 20, cardHeight: 35, cardGap: 2, dot: 8 };
	return { ...model.carry!, geometry };
}

describe("Select tasks in the block (bulk actions)", () => {
	it("starts from ⋯, picks by tap instead of opening the card's menu, and stops on the cross", async () => {
		const h = await projectHarness();
		let model = noteModel(h);
		model = pass(h, model, { kind: "selectPicked" }).model;
		expect(model.select).toEqual({ selecting: true, picked: [] });
		const idea = keyOf(model, "Idea");
		model = pass(h, model, tap(idea)).model;
		expect(model.select?.picked).toEqual([idea]);
		expect(model.layers).toEqual([]);
		expect(rowMarks(model).picking).toBe(true);
		model = pass(h, model, tap(idea)).model;
		expect(model.select).toEqual({ selecting: true, picked: [] });
		model = pass(h, model, { kind: "acted", act: { act: "selectStop", key: null, value: null } }).model;
		expect(model.select).toBeNull();
	});

	it("picks with ⌘ on the desktop and a run with Shift; a plain tap lets the picks go", async () => {
		const h = await projectHarness();
		let model = noteModel(h, true);
		const parent = keyOf(model, "Parent");
		const shop = keyOf(model, "Shop");
		model = pass(h, model, tap(parent, true)).model;
		model = pass(h, model, tap(shop, false, true)).model;
		expect(model.select?.picked).toEqual([parent, keyOf(model, "Child"), shop]);
		expect(model.select?.selecting).toBe(false);
		model = pass(h, model, tap(keyOf(model, "Idea"))).model;
		expect(model.select).toBeNull();
	});

	it("does not pick with ⌘ on the phone: the tap is the card's", async () => {
		const h = await projectHarness();
		const model = pass(h, noteModel(h, false), tap(keyOf(noteModel(h, false), "Idea"), true)).model;
		expect(model.select).toBeNull();
	});

	it("carries the picked cards the core says go along (tasks.carried), and a drop that lands ends Select tasks", async () => {
		const h = await projectHarness();
		let model = noteModel(h);
		model = pass(h, model, { kind: "selectPicked" }).model;
		const idea = keyOf(model, "Idea");
		const call = keyOf(model, "Call the bank");
		const shop = keyOf(model, "Shop");
		model = pass(h, model, tap(idea)).model;
		model = pass(h, model, tap(shop)).model;
		const refused = pass(h, model, { kind: "carry", msg: { kind: "lift", key: idea, at: { x: 0, y: 0 }, box: { left: 0, top: 0, width: 300, height: 35 } } }).model;
		expect(refused.carry?.origins).toEqual(["inbox", "day"]);
		model = pass(h, model, tap(shop)).model;
		model = pass(h, model, tap(call)).model;
		const lifted = pass(h, model, { kind: "carry", msg: { kind: "lift", key: idea, at: { x: 0, y: 0 }, box: { left: 0, top: 0, width: 300, height: 35 } } });
		expect(lifted.doors).toEqual(["tasks.carried", "tasks.startCarry"]);
		model = lifted.model;
		expect(model.carry?.rows).toEqual([idea, call]);
		expect(rowMarks(model).waiting).toEqual(new Set([idea, call]));
		const geometry = {
			lists: [{ column: "inbox" as const, left: 0, width: 300, top: 0, bottom: 74, rows: [ { key: idea, top: 0, height: 35, left: 0, width: 300 }, { key: call, top: 37, height: 35, left: 0, width: 300 } ] }],
			indent: 20,
			cardHeight: 35,
			cardGap: 2,
			dot: 8,
		};
		model = pass(h, model, { kind: "carry", msg: { kind: "measured", geometry } }).model;
		expect(targetAt(refusedWith(refused), refused.pinned!, projectsView(refused), 150, 70)).toBeNull();
		const target = targetAt(model.carry!, model.pinned!, projectsView(model), 150, 70);
		expect(target?.drop?.kind).toBe("list");
		model = pass(h, model, { kind: "carry", msg: { kind: "over", target } }).model;
		const dropped = pass(h, model, { kind: "carry", msg: { kind: "drop" } });
		expect(dropped.doors).toEqual(["tasks.drop", "tasks.endCarry"]);
		expect(dropped.model.select).toBeNull();
	});
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { BulkController, type BulkDeps } from "../../src/ui/BulkController";
import { bulkCanRemoveDue, bulkLevelTiles, bulkMoveTiles, bulkNextPriority, bulkProgress, countLabel } from "../../src/ui/menu/BulkMenu";
import { type PickedCard, TaskSelection } from "../../src/ui/TaskSelection";
import type { TaskDragPayload } from "../../src/ui/drag/DropTarget";

const T = "2026-11-03";
let n = 0;
const item = (extra: Partial<TaskItem> = {}): TaskItem => {
	const i = n++;
	return { key: { section: "now", index: i, path: [], raw: `- [ ] T${i}` }, text: `T${i}`, status: "todo", dueDate: null, slot: null, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, ...extra };
};
const LEVELS = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
] as const;

function cards(items: readonly TaskItem[], column: PickedCard["column"] = "left"): PickedCard[] {
	const list = document.body.appendChild(document.createElement("div"));
	return items.map((it) => ({ item: it, card: list.appendChild(Object.assign(document.createElement("div"), { className: "tc-card" })), column, subtree: [] }));
}

describe("the bulk menu", () => {
	it("counts the tasks", () => {
		expect(countLabel(1)).toBe("1 task");
		expect(countLabel(3)).toBe("3 tasks");
	});

	it("offers In progress unless every task already is", () => {
		expect(bulkProgress([item({ status: "inProgress" }), item()])).toEqual({ label: "In progress", status: "inProgress" });
		expect(bulkProgress([item({ status: "inProgress" }), item({ status: "inProgress" })])).toEqual({ label: "Stop progress", status: "todo" });
	});

	it("marks the level every task shares, none for mixed levels, and a tap on the shared one takes it off", () => {
		const p1 = { prefix: "p1", color: "red" } as const;
		const shared = [item({ priority: p1 }), item({ priority: p1 })];
		expect(bulkLevelTiles(shared, LEVELS).map((t) => t.on)).toEqual([true, false]);
		expect(bulkLevelTiles([item({ priority: p1 }), item()], LEVELS).map((t) => t.on)).toEqual([false, false]);
		expect(bulkNextPriority(shared, "p1")).toBeNull();
		expect(bulkNextPriority([item({ priority: p1 }), item()], "p1")).toBe("p1");
	});

	it("leaves out Today only when every task already stands on today", () => {
		const soon = item({ key: { section: "soon", index: 0, path: [], raw: "- [ ] S" } });
		expect(bulkMoveTiles([item(), item()], T).map((t) => t.id)).toEqual(["tomorrow", "pick"]);
		expect(bulkMoveTiles([item(), soon], T).map((t) => t.id)).toEqual(["today", "tomorrow", "pick"]);
	});

	it("offers Remove due date when some task has a date other than today", () => {
		expect(bulkCanRemoveDue([item({ dueDate: T })], T)).toBe(false);
		expect(bulkCanRemoveDue([item({ dueDate: T }), item({ dueDate: "2026-11-05" })], T)).toBe(true);
	});
});

describe("the selection", () => {
	it("picks with ⌘-click, drops with a second one, and keeps a task's pick across a redraw", () => {
		const selection = new TaskSelection();
		const [a, b] = cards([item(), item()]);
		selection.toggle(a);
		selection.toggle(b);
		expect(selection.cards.map((c) => c.item)).toEqual([a.item, b.item]);
		expect(a.card.classList.contains("is-selected")).toBe(true);
		selection.toggle(a);
		expect(selection.cards.map((c) => c.item)).toEqual([b.item]);
		b.card.remove();
		const [redrawn] = cards([b.item]);
		selection.attach(redrawn);
		expect(redrawn.card.classList.contains("is-selected")).toBe(true);
		expect(selection.size).toBe(1);
	});

	it("picks the run from the last picked card with Shift-click", () => {
		const selection = new TaskSelection();
		const column = cards([item(), item(), item(), item()]);
		selection.toggle(column[0]);
		selection.extend(column[2], column);
		expect(selection.cards.map((c) => c.card)).toEqual(column.slice(0, 3).map((c) => c.card));
	});
});

function controller(extra: Partial<BulkDeps> = {}): BulkController {
	return new BulkController({
		root: document.body,
		apply: async () => {},
		today: () => T,
		day: () => T,
		levels: () => LEVELS,
		cards: () => [],
		sections: () => null,
		desktop: () => true,
		isMod: (e) => e.metaKey,
		...extra,
	});
}

describe("bulk actions", () => {
	it("picks on ⌘-click on the desktop only", () => {
		const [a] = cards([item()]);
		expect(controller().pick(a, new MouseEvent("click", { metaKey: true }), "tap")).toBe(true);
		expect(controller({ desktop: () => false }).pick(a, new MouseEvent("click", { metaKey: true }), "tap")).toBe(false);
	});

	it("lets the selection go on a plain click of a card not picked, which then opens its own menu", () => {
		const bulk = controller();
		const [a, b] = cards([item(), item()]);
		bulk.pick(a, new MouseEvent("click", { metaKey: true }), "tap");
		expect(bulk.pick(b, new MouseEvent("click"), "tap")).toBe(false);
		expect(bulk.selection.size).toBe(0);
	});

	it("carries the other picked cards along, not their own subtasks, and lifting a card not picked lets them go", () => {
		const bulk = controller();
		const [a, b, c] = cards([item(), item(), item()]);
		const withChild = { ...a, subtree: [c.card] };
		for (const card of [withChild, b, c]) bulk.selection.toggle(card);
		expect(bulk.carried(b.item).map((p) => p.item)).toEqual([a.item]);
		const [other] = cards([item()]);
		expect(bulk.carried(other.item)).toEqual([]);
		expect(bulk.selection.size).toBe(0);
	});

	it("turns a drop of several cards into one step each, by where each came from", () => {
		const bulk = controller();
		const [a] = cards([item()]);
		const b = item({ key: { section: "soon", index: 0, path: [], raw: "- [ ] S" } });
		const drag: TaskDragPayload = { item: a.item, from: "left", durationMin: null, grabPx: 0, grabX: 0, carried: [{ item: b, from: "soon" }] };
		const steps = bulk.dropSteps(drag, { kind: "listBefore", before: null, column: "left" });
		expect(steps).toEqual([
			{ key: a.item.key, change: { kind: "moveBefore", before: null, date: T } },
			{ key: b.key, change: { kind: "moveToList", date: T } },
		]);
		expect(bulk.dropSteps({ ...drag, carried: [] }, { kind: "listBefore", before: null, column: "left" })).toBeNull();
	});

	it("offers the cancel ring only while several cards are carried", () => {
		const bulk = controller();
		const [a] = cards([item()]);
		const drag: TaskDragPayload = { item: a.item, from: "left", durationMin: null, grabPx: 0, grabX: 0 };
		expect(bulk.targets(drag)).toEqual([]);
		expect(bulk.targets({ ...drag, carried: [{ item: item(), from: "left" }] })).toHaveLength(1);
		bulk.settled();
	});
});

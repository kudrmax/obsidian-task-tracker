// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { BulkController, type BulkDeps } from "../../src/ui/BulkController";
import { bulkCanRemoveDue, bulkLevelTiles, bulkMoveTiles, bulkNextPriority, bulkProgress, countLabel } from "../../src/ui/menu/BulkMenu";
import { type PickedCard, TaskSelection } from "../../src/ui/TaskSelection";
import type { TaskDragPayload } from "../../src/ui/drag/DropTarget";
import { onDay } from "../fakes/itemOnDay";

const T = "2026-11-03";
let n = 0;
const item = (extra: Partial<TaskItem> = {}): TaskItem => {
	const i = n++;
	return onDay({ key: { section: "now", index: i, path: [], raw: `- [ ] T${i}` }, text: `T${i}`, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: extra.key?.section ?? "now", isSubtask: (extra.key?.path.length ?? 0) > 0, ...extra }, T);
};
const LEVELS = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
] as const;

function cards(items: readonly TaskItem[], column: PickedCard["column"] = "day"): PickedCard[] {
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

	it("offers Remove due date when some task may lose its date, as the item tells", () => {
		expect(bulkCanRemoveDue([item({ dueDate: T })])).toBe(false);
		expect(bulkCanRemoveDue([item({ dueDate: T }), item({ dueDate: "2026-11-05" })])).toBe(true);
		expect(bulkCanRemoveDue([item({ dueDate: "2026-11-05", can: { postpone: true, removeDue: false, remind: false, setPriority: true, setLabels: true } })])).toBe(false);
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

	it("keeps a task picked once it is written anew, on the card drawn for its new line", () => {
		const selection = new TaskSelection();
		const [a] = cards([item()]);
		selection.toggle(a);
		const written = { ...a.item, key: { ...a.item.key, raw: `${a.item.key.raw} #label/X` } };
		selection.forgetDrawn();
		const [redrawn] = cards([written]);
		selection.attach(redrawn);
		expect(selection.has(written)).toBe(false);
		selection.renew([{ from: a.item.key, to: written.key }]);
		expect(selection.cards.map((c) => c.card)).toEqual([redrawn.card]);
		expect(redrawn.card.classList.contains("is-selected")).toBe(true);
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
	const bulk = new BulkController({
		root: document.body,
		apply: async () => {},
		labels: () => [],
		setLabels: async (steps) => steps.map(() => null),
		today: () => T,
		day: () => T,
		levels: () => LEVELS,
		cards: () => [],
		sections: () => null,
		toSection: async () => {},
		desktop: () => true,
		isMod: (e) => e.metaKey,
		...extra,
	});
	bulk.mount();
	return bulk;
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

	it("lets the picked cards go once several are dropped, keeps them for one carried alone", () => {
		const bulk = controller();
		const [a, b] = cards([item(), item()]);
		bulk.selection.toggle(a);
		bulk.selection.toggle(b);
		const drag: TaskDragPayload = { item: a.item, from: "day", durationMin: null, grabPx: 0 };
		bulk.dropping(drag);
		expect(bulk.selection.size).toBe(2);
		bulk.dropping({ ...drag, carried: [{ item: b.item, from: "soon" }] });
		expect(bulk.selection.size).toBe(0);
	});

	it("sends the picked tasks to a section in one call and lets them go", async () => {
		const toSection = vi.fn(async () => {});
		const sections = vi.fn(() => ({ choice: { names: ["Work"], current: null, ungrouped: "No section" }, shared: true }));
		const bulk = controller({ sections, toSection });
		const [a, b] = cards([item(), item()]);
		for (const card of [a, b]) document.body.append(card.card);
		bulk.selection.toggle(a);
		bulk.selection.toggle(b);
		expect(bulk.pick(a, new MouseEvent("click"), "tap")).toBe(true);
		expect(sections).toHaveBeenCalledWith([a, b]);
		const row = (label: string) => [...document.querySelectorAll<HTMLElement>(".tc-menu-row")].find((r) => r.textContent?.trim() === label)!;
		row("Section").click();
		row("Work").click();
		await Promise.resolve();
		expect(toSection).toHaveBeenCalledWith([a.item.key, b.item.key], "Work");
		expect(bulk.selection.size).toBe(0);
		document.body.replaceChildren();
	});

	it("offers the cancel ring only while several cards are carried", () => {
		const bulk = controller();
		const [a] = cards([item()]);
		const drag: TaskDragPayload = { item: a.item, from: "day", durationMin: null, grabPx: 0 };
		expect(bulk.targets(drag)).toEqual([]);
		expect(bulk.targets({ ...drag, carried: [{ item: item(), from: "day" }] })).toHaveLength(1);
		bulk.settled();
	});
});

describe("Select tasks", () => {
	const count = () => document.querySelector<HTMLButtonElement>(".tc-select-capsule .tc-select-num")!;
	const menuButton = () => document.querySelector<HTMLButtonElement>(".tc-select-menu")!;

	it("puts a circle on every card and picks with a plain tap, on the phone too", () => {
		const bulk = controller({ desktop: () => false });
		const [a, b] = cards([item(), item()]);
		bulk.attach(a);
		expect(a.card.querySelector(".tc-pick")).not.toBeNull();
		expect(bulk.pick(a, new MouseEvent("click"), "tap")).toBe(false);
		bulk.start();
		expect(document.body.classList.contains("is-selecting")).toBe(true);
		expect(bulk.pick(a, new MouseEvent("click"), "tap")).toBe(true);
		expect(bulk.pick(b, new MouseEvent("click"), "tap")).toBe(true);
		expect(bulk.selection.size).toBe(2);
		expect(bulk.pick(a, new MouseEvent("click"), "tap")).toBe(true);
		expect(bulk.selection.cards.map((c) => c.item)).toEqual([b.item]);
		bulk.stop();
		document.body.replaceChildren();
	});

	it("counts the picked tasks beside the cross; the count and «⋯» are dim while none is", () => {
		const bulk = controller({ desktop: () => false });
		const [a] = cards([item()]);
		bulk.start();
		expect(count().textContent).toBe("0");
		expect([count(), menuButton()].map((b) => b.classList.contains("is-off"))).toEqual([true, true]);
		bulk.pick(a, new MouseEvent("click"), "tap");
		expect(count().textContent).toBe("1");
		expect([count(), menuButton()].map((b) => b.classList.contains("is-off"))).toEqual([false, false]);
		bulk.stop();
		document.body.replaceChildren();
	});

	it("keeps the picks on a press elsewhere and on lifting a card not picked; the cross lets them go and stops", () => {
		const bulk = controller({ desktop: () => false });
		const [a, b] = cards([item(), item()]);
		bulk.start();
		bulk.pick(a, new MouseEvent("click"), "tap");
		bulk.onPress(document.body);
		expect(bulk.carried(b.item)).toEqual([]);
		expect(bulk.selection.size).toBe(1);
		document.querySelector<HTMLButtonElement>(".tc-select-exit")!.click();
		expect(bulk.selection.size).toBe(0);
		expect(document.body.classList.contains("is-selecting")).toBe(false);
		document.body.replaceChildren();
	});

	it("opens the menu for them all from «⋯» where the plus stands, and an action ends Select tasks", async () => {
		const apply = vi.fn(async () => {});
		const bulk = controller({ desktop: () => false, apply });
		const [a, b] = cards([item(), item()]);
		bulk.start();
		bulk.pick(a, new MouseEvent("click"), "tap");
		bulk.pick(b, new MouseEvent("click"), "tap");
		menuButton().click();
		expect(document.querySelector(".tc-panel.is-bulk.is-over .tc-menu-title")?.textContent).toBe("2 tasks");
		document.querySelector<HTMLButtonElement>(".tc-panel.is-bulk .tc-menu-tile")!.click();
		await Promise.resolve();
		expect(apply).toHaveBeenCalledWith([a, b].map((c) => ({ key: c.item.key, change: { kind: "status", status: "done" } })));
		expect(bulk.selection.size).toBe(0);
		expect(document.body.classList.contains("is-selecting")).toBe(false);
		document.body.replaceChildren();
	});

	it("ends with Escape", () => {
		const bulk = controller({ desktop: () => false });
		bulk.start();
		bulk.onKey(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(document.body.classList.contains("is-selecting")).toBe(false);
	});
});

describe("the selection across redraws", () => {
	it("forgets the cards a redraw took away, and keeps the task picked on its new card", () => {
		const selection = new TaskSelection();
		const tasks = [item(), item(), item()];
		const first = cards(tasks);
		selection.toggle(first[0]);
		for (let redraw = 0; redraw < 100; redraw++) {
			selection.forgetDrawn();
			const drawn = cards(redraw === 99 ? tasks : [item(), item(), item()]);
			drawn.forEach((card) => selection.attach(card));
			if (redraw === 99) expect(drawn[0].card.classList.contains("is-selected")).toBe(true);
			for (const card of first) card.card.remove();
		}
		expect(selection.drawnCount).toBeLessThanOrEqual(3);
		expect(selection.has(tasks[0])).toBe(true);
	});
});

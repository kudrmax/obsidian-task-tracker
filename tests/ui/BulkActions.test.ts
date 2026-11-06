// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { BulkController, type BulkDeps } from "../../src/ui/BulkController";
import { carriedWith, taskMenu } from "../../src/application/menus";
import { countLabel } from "../../src/ui/menu/BulkMenu";
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
		menu: (items) => taskMenu(items, T, LEVELS, [], null),
		togglePriority: async () => {},
		toggleLabel: async (keys) => keys.map(() => null),
		removeDue: async () => {},
		carried: carriedWith,
		today: () => T,
		day: () => T,
		cards: () => [],
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

	it("carries the picked cards the service says go along, and lifting a card not picked lets them go", () => {
		const carried = vi.fn(carriedWith);
		const bulk = controller({ carried });
		const a = item();
		const child = item({ key: { ...a.key, path: [0], raw: "- [ ] child" } });
		const [ca, b, c] = cards([a, item(), child]);
		for (const card of [ca, b, c]) bulk.selection.toggle(card);
		expect(bulk.carried(b.item).map((p) => p.item)).toEqual([a]);
		expect(carried).toHaveBeenCalledWith(b.item.key, [a.key, b.item.key, child.key]);
		const [other] = cards([item()]);
		expect(bulk.carried(other.item)).toEqual([]);
		expect(bulk.selection.size).toBe(0);
	});

	it("lets the picked cards go once several are dropped, keeps them for one carried alone", () => {
		const bulk = controller();
		const [a, b] = cards([item(), item()]);
		bulk.selection.toggle(a);
		bulk.selection.toggle(b);
		const drag: TaskDragPayload = { item: a.item, from: "day", grabPx: 0 };
		bulk.dropping(drag);
		expect(bulk.selection.size).toBe(2);
		bulk.dropping({ ...drag, carried: [{ item: b.item, from: "soon" }] });
		expect(bulk.selection.size).toBe(0);
	});

	it("sends the picked tasks to a section in one call and lets them go", async () => {
		const toSection = vi.fn(async () => {});
		const menu = vi.fn((items: readonly TaskItem[]) => ({ ...taskMenu(items, T, LEVELS, [], null), sections: { choice: { names: ["Work"], current: null, ungrouped: "No section" }, shared: true } }));
		const bulk = controller({ menu, toSection });
		const [a, b] = cards([item(), item()]);
		for (const card of [a, b]) document.body.append(card.card);
		bulk.selection.toggle(a);
		bulk.selection.toggle(b);
		expect(bulk.pick(a, new MouseEvent("click"), "tap")).toBe(true);
		expect(menu).toHaveBeenCalledWith([a.item, b.item], [a, b]);
		const row = (label: string) => [...document.querySelectorAll<HTMLElement>(".tc-menu-row")].find((r) => r.textContent?.trim() === label)!;
		row("Section").click();
		row("Work").click();
		await Promise.resolve();
		expect(toSection).toHaveBeenCalledWith([a.item.key, b.item.key], "Work");
		expect(bulk.selection.size).toBe(0);
		document.body.replaceChildren();
	});

	it("hands a level and Remove due date to the service with every picked task, and lets them go", async () => {
		const togglePriority = vi.fn(async () => {});
		const removeDue = vi.fn(async () => {});
		const open = () => {
			const bulk = controller({ togglePriority, removeDue });
			const picked = cards([item({ dueDate: "2026-11-05" }), item()]);
			for (const card of picked) bulk.selection.toggle(card);
			bulk.pick(picked[0], new MouseEvent("click"), "tap");
			return { bulk, keys: picked.map((card) => card.item.key) };
		};
		const first = open();
		document.querySelector<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile")!.click();
		expect(togglePriority).toHaveBeenCalledWith(first.keys, "p1");
		expect(first.bulk.selection.size).toBe(0);
		document.body.replaceChildren();
		const second = open();
		const moves = document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-move .tc-menu-tile");
		moves[moves.length - 1].click();
		[...document.querySelectorAll<HTMLElement>(".tc-menu-row")].find((r) => r.textContent?.trim() === "Remove due date")!.click();
		expect(removeDue).toHaveBeenCalledWith(second.keys);
		document.body.replaceChildren();
	});

	it("offers the cancel ring only while several cards are carried", () => {
		const bulk = controller();
		const [a] = cards([item()]);
		const drag: TaskDragPayload = { item: a.item, from: "day", grabPx: 0 };
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

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { TaskList } from "../../src/ui/TaskList";
import { onDay } from "../fakes/itemOnDay";

const task = (text: string, index: number): TaskItem => onDay({
	key: { section: "now", index, path: [], raw: text },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
	priority: null,
	group: null,
	subtasks: [],
	progress: null,
	parentText: null,
	description: null,
	list: "now",
	isSubtask: false,
}, "2026-11-01");

describe("TaskList", () => {
	it("hands out the same cards until it draws again", () => {
		const list = new TaskList(document.createElement("div"), { items: () => [task("A", 0), task("B", 1)], day: () => null });
		list.render();
		const cards = list.listCards;
		expect(list.listCards).toBe(cards);
		list.render();
		expect(list.listCards).not.toBe(cards);
		expect(list.listCards).toEqual(cards);
	});

	it("gives the cards it is about to draw, as listCards gives them once it has: sections, subtasks and all", () => {
		let items = [task("A", 0)];
		const list = new TaskList(document.createElement("div"), { items: () => items, day: () => null, grouped: () => true });
		list.render();
		const sub = { ...task("A1", 0), key: { section: "now" as const, index: 1, path: [0], raw: "A1" }, group: "Morning" };
		items = [task("Z", 0), { ...task("B", 1), group: "Morning", subtasks: [sub] }, task("C", 2)];
		const coming = list.comingCards;
		expect(list.listCards.map((c) => c.key.raw)).toEqual(["A"]);
		list.render();
		expect(coming).toEqual(list.listCards);
		expect(coming.map((c) => [c.key.raw, c.level, c.group])).toEqual([["Z", 0, null], ["C", 0, null], ["B", 0, "Morning"], ["A1", 1, "Morning"]]);
	});

	it("draws a collapsed task without its subtasks, its card marked, and hands its subtree to nobody", () => {
		const sub = { ...task("A1", 0), key: { section: "now" as const, index: 0, path: [0], raw: "A1" } };
		const subtrees: [string, number][] = [];
		const list = new TaskList(document.createElement("div"), {
			items: () => [{ ...task("A", 0), subtasks: [sub], progress: { done: 0, total: 1 }, collapsed: true }, { ...task("B", 1), subtasks: [{ ...sub, key: { ...sub.key, index: 1 } }] }],
			day: () => null,
			onCard: (_card, item, subtree) => subtrees.push([item.text, subtree.length]),
		});
		list.render();
		expect(list.cards.map((c) => [c.item.text, c.level])).toEqual([["A", 0], ["B", 0], ["A1", 1]]);
		expect(list.comingCards.map((c) => c.key.raw)).toEqual(["A", "B", "A1"]);
		expect(list.cards.map((c) => c.card.classList.contains("is-collapsed"))).toEqual([true, false, false]);
		expect(subtrees).toEqual([["A", 0], ["B", 1], ["A1", 0]]);
	});

	it("an empty section shows its header over the No tasks plate, which stands among the elements", () => {
		const root = document.createElement("div");
		const plates: string[] = [];
		const list = new TaskList(root, {
			items: () => [task("A", 0)],
			day: () => null,
			grouped: () => true,
			sections: () => [{ name: null, empty: false }, { name: "Evening", empty: true }],
			ungroupedName: () => "No section",
			onPlate: (_plate, group) => plates.push(group.name ?? ""),
		});
		list.render();
		expect(list.elements.map((node) => node.textContent)).toEqual(["No section", "A", "Evening", "No tasks"]);
		expect(list.plateOf("Evening")?.classList.contains("tc-group-empty")).toBe(true);
		expect(list.plateOf(null)).toBeNull();
		expect(plates).toEqual(["Evening"]);
	});

	it("a field typed into an empty section stands in place of its plate", () => {
		const list = new TaskList(document.createElement("div"), {
			items: () => [task("A", 0)],
			day: () => null,
			grouped: () => true,
			sections: () => [{ name: null, empty: false }, { name: "Evening", empty: true }],
			entry: () => ({ place: { kind: "gap", index: 1, level: 0, group: "Evening" }, pending: [], field: (row) => row }),
		});
		list.render();
		expect(list.plateOf("Evening")).toBeNull();
		expect([...list.el.children].slice(-1)[0]?.classList.contains("tc-quick-row")).toBe(true);
	});
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { TaskList } from "../../src/ui/TaskList";

const task = (text: string, index: number): TaskItem => ({
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
});

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
});

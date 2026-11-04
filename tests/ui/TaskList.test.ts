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
	repeat: null,
	priority: null,
	group: null,
	subtasks: [],
	progress: null,
	parentText: null,
	description: null,
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
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { BulkMenu, type BulkActions, bulkLabelTiles, bulkNextLabels } from "../../src/ui/menu/BulkMenu";
import { onDay } from "../fakes/itemOnDay";

const item = (index: number, marks: Partial<Pick<TaskItem, "priority" | "labels">> = {}): TaskItem => onDay({
	key: { section: "now", index, path: [], raw: `- [ ] T${index}` },
	text: `T${index}`,
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
	...marks,
}, "2026-11-04");

describe("BulkMenu (block 3)", () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	it("measures every picked card before it lifts any", () => {
		vi.useFakeTimers();
		const lifted: number[] = [];
		const cards = Array.from({ length: 5 }, (_, i) => {
			const card = document.body.appendChild(document.createElement("div"));
			card.getBoundingClientRect = () => {
				lifted.push(document.querySelectorAll(".tc-lifted").length);
				return new DOMRect(10, 100 + i * 40, 175, 35);
			};
			return card;
		});
		const done = async () => undefined;
		const actions: BulkActions = { setStatus: done, setPriority: done, postpone: done, removeDue: done, toSection: done, remove: done, setLabels: async () => null };
		BulkMenu.open({ items: cards.map((_, i) => item(i)), cards, source: cards[0], at: "beside", today: "2026-11-04", day: "2026-11-04", levels: [], actions, onClose: () => {} });
		expect(lifted.length).toBeGreaterThanOrEqual(5);
		expect(lifted.every((count) => count === 0)).toBe(true);
		expect(document.querySelectorAll(".tc-lifted").length).toBe(5);
	});
});

describe("the labels of several tasks", () => {
	const RED = { name: "Важное", color: "red" } as const;
	const BLUE = { name: "Срочное", color: "blue" } as const;
	const P1 = { prefix: "p1", color: "red" } as const;

	it("is on when every task without a priority has the label, off to press when every task has a priority", () => {
		const tasks = [item(0, { labels: [RED] }), item(1, { priority: P1 })];
		expect(bulkLabelTiles(tasks, [RED, BLUE]).map((t) => [t.on, t.disabled])).toEqual([[true, false], [false, false]]);
		expect(bulkLabelTiles([item(0, { priority: P1 })], [RED]).map((t) => t.disabled)).toEqual([true]);
	});

	it("puts a label on each task without it, or takes it off all that have it, and leaves the tasks with a priority", () => {
		const tasks = [item(0, { labels: [RED] }), item(1), item(2, { priority: P1 })];
		expect(bulkNextLabels(tasks, "Важное")).toEqual([["Важное"], ["Важное"], []]);
		expect(bulkNextLabels([item(0, { labels: [RED] }), item(1, { labels: [RED, BLUE] })], "Важное")).toEqual([[], ["Срочное"]]);
	});
});

import { describe, expect, it } from "vitest";
import { type GroupName, listView, type TaskItem } from "../../core/application/contracts";
import { onDay } from "../fakes/itemOnDay";

let n = 0;
const item = (text: string, group: GroupName, subtasks: readonly TaskItem[] = [], collapsed = false): TaskItem =>
	onDay(
		{
			key: { section: "now", index: n++, path: [], raw: `- [ ] ${text}` },
			text,
			status: "todo",
			dueDate: null,
			slot: null,
			reminder: "notification",
			repeat: null,
			open: true,
			repeatable: true,
			priority: null,
			group,
			subtasks,
			progress: null,
			parentText: null,
			description: null,
			list: "now",
			isSubtask: false,
			collapsed,
		},
		"2026-11-01",
	);

const sections = (...names: [GroupName, boolean][]) => names.map(([name, empty]) => ({ name, empty }));
const rows = (items: readonly TaskItem[]) => listView(items, false).groups[0].rows.map(({ item, level }) => [item.text, level]);

describe("a list's rows", () => {
	it("each task, then its open subtasks a level deeper, at every depth", () => {
		const tree = item("A", null, [item("A1", null, [item("A1a", null)]), item("A2", null)]);
		expect(rows([tree, item("B", null)])).toEqual([
			["A", 0],
			["A1", 1],
			["A1a", 2],
			["A2", 1],
			["B", 0],
		]);
	});

	it("a folded task's subtasks are no rows; the task is", () => {
		expect(rows([item("A", null, [item("A1", null)], true), item("B", null)])).toEqual([
			["A", 0],
			["B", 0],
		]);
	});

	it("each section its own rows", () => {
		const groups = listView([item("A", null), item("B", "X", [item("B1", "X")])], true).groups;
		expect(groups.map((g) => [g.name, g.rows.map((r) => r.item.text)])).toEqual([
			[null, ["A"]],
			["X", ["B", "B1"]],
		]);
	});
});

describe("an empty section", () => {
	it("is drawn over the No tasks plate; a group with tasks is not", () => {
		const drawn = listView([item("A", null)], true, sections(["Morning", true], [null, false])).groups;
		expect(drawn.map((g) => [g.name, g.empty])).toEqual([
			["Morning", true],
			[null, false],
		]);
	});

	it("No section is never empty, nor a list without headers", () => {
		expect(listView([], false).groups[0].empty).toBe(false);
	});
});

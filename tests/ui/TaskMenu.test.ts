import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { menuRows, priorityRows } from "../../src/ui/menu/TaskMenu";

const item = (extra: Partial<TaskItem> = {}): TaskItem => ({ key: { section: "now", index: 0, raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, ...extra });

describe("menuRows", () => {
	it("offers the three groups for a task to do", () => {
		const groups = menuRows(item({ dueDate: "2026-11-03" }));
		expect(groups.map((g) => g.map((r) => r.id))).toEqual([["progress", "done", "wontdo"], ["due", "priority", "rename"], ["delete"]]);
		expect(groups[0][0].label).toBe("In progress");
		expect(groups[1][0].value).toBe("3 Nov");
		expect(groups[2][0].danger).toBe(true);
	});

	it("turns In progress into Stop progress for a task in progress, and shows no value without a date", () => {
		const groups = menuRows(item({ status: "inProgress" }));
		expect(groups[0][0].label).toBe("Stop progress");
		expect(groups[1][0].value).toBe("");
	});
});

describe("priority in the menu", () => {
	const LEVELS = [
		{ prefix: "p1", color: "red" },
		{ prefix: "p2", color: "orange" },
	] as const;

	it("shows the level's dot and prefix beside Priority, nothing without one", () => {
		const row = menuRows(item({ priority: LEVELS[0] }))[1][1];
		expect(row).toMatchObject({ id: "priority", label: "Priority", value: "p1", dot: "red", icon: "priority" });
		expect(menuRows(item())[1][1]).toMatchObject({ value: "", dot: null });
	});

	it("lists the levels in order with the current one checked", () => {
		expect(priorityRows(item({ priority: LEVELS[1] }), LEVELS)).toEqual([
			{ prefix: "p1", color: "red", on: false },
			{ prefix: "p2", color: "orange", on: true },
		]);
		expect(priorityRows(item(), LEVELS).some((r) => r.on)).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { menuRows } from "../../src/ui/menu/TaskMenu";

const item = (extra: Partial<TaskItem> = {}): TaskItem => ({ key: { section: "now", index: 0, raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, ...extra });

describe("menuRows", () => {
	it("offers the three groups for a task to do", () => {
		const groups = menuRows(item({ dueDate: "2026-11-03" }));
		expect(groups.map((g) => g.map((r) => r.id))).toEqual([["progress", "done", "wontdo"], ["due", "rename"], ["delete"]]);
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

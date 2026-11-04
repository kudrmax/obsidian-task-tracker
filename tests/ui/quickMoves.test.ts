import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { canRemoveDue, moveTiles } from "../../src/ui/menu/quickMoves";

const TODAY = "2026-11-03";
const item = (extra: Partial<TaskItem> = {}): TaskItem => ({ key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, repeat: null, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, ...extra });
const ids = (task: TaskItem) => moveTiles(task, TODAY).map((tile) => tile.id);

describe("moveTiles", () => {
	it("offers Today, Tomorrow and Pick a date to a task on no day, with the days they put it off to", () => {
		expect(moveTiles(item(), TODAY).map((tile) => [tile.label, tile.icon, tile.date])).toEqual([
			["Today", "now", TODAY],
			["Tomorrow", "tomorrow", "2026-11-04"],
			["Pick a date", "calendar", null],
		]);
	});

	it("leaves out Today for a task already on today: in Now, or on today's timeline", () => {
		expect(ids(item({ key: { section: "now", index: 0, path: [], raw: "- [ ] A" } }))).toEqual(["tomorrow", "pick"]);
		expect(ids(item({ slot: { date: TODAY, start: 600, end: 660 } }))).toEqual(["tomorrow", "pick"]);
	});

	it("leaves out Tomorrow for a task due tomorrow, and keeps both for one due on a later day", () => {
		expect(ids(item({ dueDate: "2026-11-04" }))).toEqual(["today", "pick"]);
		expect(ids(item({ dueDate: "2026-11-09" }))).toEqual(["today", "tomorrow", "pick"]);
	});

	it("puts a done task off nowhere", () => {
		expect(ids(item({ key: { section: "done", index: 0, path: [], raw: "- [x] A" }, status: "done" }))).toEqual([]);
	});
});

describe("canRemoveDue", () => {
	it("lets a date be taken off, except today's: a task for today is in Now by that date", () => {
		expect(canRemoveDue(TODAY, "2026-11-05")).toBe(true);
		expect(canRemoveDue(TODAY, TODAY)).toBe(false);
		expect(canRemoveDue(TODAY, null)).toBe(false);
	});
});

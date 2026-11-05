import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { moveTiles } from "../../src/ui/menu/quickMoves";
import { onDay } from "../fakes/itemOnDay";

const TODAY = "2026-11-03";
const item = (extra: Partial<TaskItem> = {}): TaskItem => onDay({ key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: extra.key?.section ?? "soon", isSubtask: (extra.key?.path.length ?? 0) > 0, ...extra }, TODAY);
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

	it("leaves out the day the item says it stands on, whatever its fields", () => {
		expect(ids(item({ day: "2026-11-04" }))).toEqual(["today", "pick"]);
		expect(ids(item({ key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, day: null }))).toEqual(["today", "tomorrow", "pick"]);
	});

	it("puts off nowhere a task the item says may not be put off", () => {
		expect(ids(item({ can: { postpone: false, removeDue: false } }))).toEqual([]);
	});

	it("puts a done task off nowhere", () => {
		expect(ids(item({ key: { section: "done", index: 0, path: [], raw: "- [x] A" }, status: "done" }))).toEqual([]);
	});
});

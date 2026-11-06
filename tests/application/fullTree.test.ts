import { describe, expect, it } from "vitest";
import { fullTree } from "../../core/application/fullTree";
import { toItem } from "../../core/application/taskItems";
import { TaskDocument } from "../../core/domain/TaskDocument";

const T = "2026-11-06";
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const MORNING = "## Now\n- [ ] Morning\n\t- [ ] Pack 🔽\n\t\t- [x] Laptop\n\t\t- [ ] Pass\n\t- [x] Wash\n\t- [ ] Tea\n";

function morning() {
	return toItem(TaskDocument.parse(MORNING, SECTIONS, { dueDate: "📅", slot: "⏰", collapsed: "🔽" }).tasks("now")[0], T);
}

describe("fullTree", () => {
	it("holds every subtask at every depth, done ones too, none folded away, as the list draws them", () => {
		const item = morning();
		expect(item.allSubtasks[0].collapsed).toBe(true);
		const tree = fullTree(item);
		expect(tree.task).toBe(item);
		expect(tree.subtasks.map((s) => s.text)).toEqual(["Pack", "Wash", "Tea"]);
		expect(tree.subtasks[0]).toMatchObject({ collapsed: false });
		expect(tree.subtasks[0].subtasks.map((s) => s.text)).toEqual(["Laptop", "Pass"]);
		expect(tree.rows.map((r) => [r.item.text, r.level])).toEqual([
			["Pack", 0],
			["Laptop", 1],
			["Pass", 1],
			["Wash", 0],
			["Tea", 0],
		]);
	});

	it("puts a new subtask last under its task: after the task and all its own, a level deeper", () => {
		const tree = fullTree(morning());
		expect(tree.newSubtask).toEqual({ index: 5, level: 0 });
		expect(tree.rows.map((r) => r.newSubtask)).toEqual([
			{ index: 3, level: 1 },
			{ index: 2, level: 2 },
			{ index: 3, level: 2 },
			{ index: 4, level: 1 },
			{ index: 5, level: 1 },
		]);
	});
});

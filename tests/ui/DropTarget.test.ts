import { describe, expect, it } from "vitest";
import type { TaskItem, TaskKey } from "../../core/application/contracts";
import { droppedTasks, originsOf, type TaskDragPayload } from "../../obsidian/ui/drag/DropTarget";
import { onDay } from "../fakes/itemOnDay";

const T = "2026-10-30";
const key = (section: TaskKey["section"], index: number): TaskKey => ({ section, index, path: [], raw: `- [ ] ${section}${index}` });
const item = (k: TaskKey): TaskItem =>
	onDay({ key: k, text: k.raw, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: k.section, isSubtask: false }, T);

describe("what a drag tells the targets and the service", () => {
	const drag: TaskDragPayload = { item: item(key("now", 0)), from: "day", grabPx: 0, carried: [{ item: item(key("soon", 1)), from: "soon" }, { item: item(key("inbox", 0)), from: "inbox" }] };

	it("asks a target about every task carried, the one under the finger first", () => {
		expect(originsOf(drag)).toEqual(["day", "soon", "inbox"]);
		expect(originsOf({ ...drag, carried: undefined })).toEqual(["day"]);
		expect(originsOf({ from: "new", item: null, grabPx: 0 })).toEqual(["new"]);
	});

	it("lets go every task carried, each with the column it came from", () => {
		expect(droppedTasks(drag)).toEqual([
			{ key: key("now", 0), from: "day" },
			{ key: key("soon", 1), from: "soon" },
			{ key: key("inbox", 0), from: "inbox" },
		]);
		expect(droppedTasks({ ...drag, from: "timeline", carried: undefined })).toEqual([{ key: key("now", 0), from: "timeline" }]);
	});
});

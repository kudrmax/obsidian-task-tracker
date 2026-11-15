import { describe, expect, it } from "vitest";
import type { FullTree, ScreenView, TaskItem } from "../../core/application/contracts";
import { entryJobStep, NO_ENTRY_JOBS, queuedEntryJobs } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";

/**
 * What a project's note block reads besides its lists: a task found again (`tasks.find`) and its full screen
 * (`tasks.fullTree`), by the view's filter as the lists are, so a card under a project's filter shows no folder mark
 * there either.
 */

const NOW = new Date(2026, 10, 15, 9, 30).getTime();
const DAY = "2026-11-15";
const FILE = ["## Inbox", "", "- [ ] Report 🗂️ Работа", "\t- [ ] Step", "- [ ] Loose", "", "## Projects", "", "- Работа", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
type Ok = Extract<DoorAnswer, { ok: true }>;
const NODE = "project:Работа";
const marks = (item: TaskItem): boolean[] => [item.project?.mark ?? null, ...item.allSubtasks.map((s) => s.project?.mark ?? null)] as boolean[];

function filtered(): { context: DoorContext; report: TaskItem } {
	const answer = callDoor("tasks.screen", [DAY, NODE], { tasks: FILE, nowMs: NOW }) as Ok;
	const context = { tasks: answer.tasks ?? FILE, nowMs: NOW, ids: answer.ids };
	return { context, report: (answer.result as ScreenView).inbox.find((i) => i.title === "Report")! };
}

describe("tasks.find and tasks.fullTree by the view's filter", () => {
	it("show no folder mark under a project's filter, as that filter's lists show none", () => {
		const { context, report } = filtered();
		expect(marks(report)).toEqual([false, false]);
		const found = (callDoor("tasks.find", [report.key, report.text, NODE], context) as Ok).result as TaskItem;
		expect(marks(found)).toEqual([false, false]);
		const tree = (callDoor("tasks.fullTree", [found, NODE], context) as Ok).result as FullTree;
		expect([tree.task.project?.mark, ...tree.rows.map((r) => r.item.project?.mark)]).toEqual([false, false]);
		expect(tree.project?.mark).toBe(false);
	});

	it("show the mark without a filter, under All, No project or Done, and where no filter is handed in, as before", () => {
		const { context, report } = filtered();
		for (const filter of [undefined, null, "all", "none", "done"]) {
			const args = filter === undefined ? [report.key, report.text] : [report.key, report.text, filter];
			const found = (callDoor("tasks.find", args, context) as Ok).result as TaskItem;
			expect({ filter, marks: marks(found) }).toEqual({ filter, marks: [true, true] });
			const tree = (callDoor("tasks.fullTree", filter === undefined ? [found] : [found, filter], context) as Ok).result as FullTree;
			expect({ filter, rows: tree.rows.map((r) => r.item.project?.mark) }).toEqual({ filter, rows: [true] });
		}
	});
});

describe("contracts.ts", () => {
	it("hands a frontend the quick entry's job order", () => {
		expect(entryJobStep(queuedEntryJobs(NO_ENTRY_JOBS, []), null)).toEqual({ jobs: NO_ENTRY_JOBS, step: null });
	});
});

import { describe, expect, expectTypeOf, it } from "vitest";
import type { BulkActionId, FieldActionId, SectionOffer, TaskItem, TaskMenuModel } from "../../core/application/contracts";
import { taskMenu } from "../../core/application/menus";
import { type Surface, TASK_ACTION_IDS, TASK_ACTIONS, absentReason, placementOf } from "../../core/application/taskActions";
import { onDay } from "../fakes/itemOnDay";

const T = "2026-11-03";
const TOMORROW = "2026-11-04";
let n = 0;
const item = (extra: Partial<TaskItem> = {}): TaskItem => {
	const i = n++;
	return onDay({ key: { section: "now", index: i, path: [], raw: `- [ ] T${i}` }, text: `T${i}`, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: extra.key?.section ?? "now", isSubtask: (extra.key?.path.length ?? 0) > 0, ...extra }, T);
};
const LEVELS = [{ prefix: "p1", color: "red" }] as const;
const LABELS = [{ name: "Важное", color: "red" }] as const;
const SURFACES: readonly Surface[] = ["taskMenu", "bulkMenu", "field", "fullScreen"];

const shape = (model: TaskMenuModel) => model.layout.map(({ group, actions }) => [group, actions.map((a) => a.id)]);

describe("the table of task actions", () => {
	it("gives every action, on every surface, a place or a reason in words", () => {
		for (const id of TASK_ACTION_IDS)
			for (const surface of SURFACES) {
				const reason = absentReason(id, surface);
				if (reason !== null) expect(reason.trim().length, `${id} on ${surface}`).toBeGreaterThan(0);
			}
	});

	it("puts no two actions of a surface on one spot of one group", () => {
		for (const surface of SURFACES) {
			const spots = TASK_ACTION_IDS.flatMap((id) => {
				const cell = placementOf(id, surface);
				return "absent" in cell ? [] : [`${cell.group}:${cell.order}`];
			});
			const days = surface === "taskMenu" || surface === "bulkMenu" ? 1 : 0;
			expect(new Set(spots).size, surface).toBe(spots.length - days);
		}
	});

	it("names every action", () => {
		for (const id of TASK_ACTION_IDS) expect(TASK_ACTIONS[id].name.length).toBeGreaterThan(0);
	});

	it("types each surface's actions from the table, so a frontend's record over them misses none", () => {
		expectTypeOf<"repeat">().toMatchTypeOf<BulkActionId>();
		expectTypeOf<"rename">().not.toMatchTypeOf<BulkActionId>();
		expectTypeOf<"description">().toMatchTypeOf<FieldActionId>();
		expectTypeOf<"newSection">().toMatchTypeOf<FieldActionId>();
		expectTypeOf<"delete">().not.toMatchTypeOf<FieldActionId>();
	});
});

describe("one task's menu, as Max ordered it (2026-11-20)", () => {
	it("stands statuses, levels, labels, the copy, When, Edit, the rows and Delete, top to bottom", () => {
		const model = taskMenu([item()], T, LEVELS, LABELS, null, { kind: "task", from: "day" });
		expect(shape(model)).toEqual([
			["statuses", ["done", "progress", "wontDo"]],
			["levels", ["level"]],
			["labels", ["label"]],
			["copy", []],
			["when", ["tomorrow", "pickDate", "repeat"]],
			["edit", ["rename", "description", "project", "subtask"]],
			["rows", ["firstStep", "openFull", "openInObsidian"]],
			["remove", ["delete"]],
		]);
	});

	it("puts Reminder last in When and Section after Project in Edit, where the task has them", () => {
		const offer: SectionOffer = { lists: { now: ["Work"], soon: [], inbox: [], backlog: [] }, ungrouped: "No section" };
		const timed = item({ can: { ...item().can, remind: true } });
		const model = taskMenu([timed], T, [], [], offer, { kind: "task", from: "day" });
		expect(shape(model).filter(([g]) => g === "when" || g === "edit")).toEqual([
			["when", ["tomorrow", "pickDate", "repeat", "reminder"]],
			["edit", ["rename", "description", "project", "section", "subtask"]],
		]);
	});

	it("offers Today in Tomorrow's place to a task already on tomorrow, with the day it writes", () => {
		const model = taskMenu([item({ day: TOMORROW, dueDate: TOMORROW })], T, [], [], null, { kind: "task", from: "day" });
		const when = model.layout.find((g) => g.group === "when")!;
		expect(when.actions.map((a) => [a.id, a.date])).toEqual([
			["today", T],
			["pickDate", null],
			["repeat", null],
		]);
	});

	it("says which status each tile writes and which ask first", () => {
		const model = taskMenu([item({ status: "inProgress" })], T, [], [], null, { kind: "task", from: "day" });
		expect(model.layout[0].actions.map((a) => [a.id, a.status, a.asks])).toEqual([
			["done", "done", false],
			["progress", "stopProgress", false],
			["wontDo", "wontDo", true],
		]);
		expect(model.layout[model.layout.length - 1].actions[0]).toMatchObject({ id: "delete", asks: true });
	});

	it("offers Open full screen everywhere but on the task the full screen shows", () => {
		const opens = (from: Parameters<typeof taskMenu>[5]) => taskMenu([item()], T, [], [], null, from).opens;
		expect(opens({ kind: "task", from: "day" })).toEqual(["openFull", "openInObsidian"]);
		expect(opens({ kind: "task", from: "full" })).toEqual(["openInObsidian"]);
		expect(opens({ kind: "task", from: "fullSubtask" })).toEqual(["openFull", "openInObsidian"]);
		expect(opens({ kind: "bulk" })).toEqual([]);
	});
});

describe("the bulk menu", () => {
	it("adds Repeat, and leaves out what concerns one task", () => {
		const model = taskMenu([item(), item()], T, [], [], null, { kind: "bulk" });
		expect(shape(model)).toEqual([
			["statuses", ["done", "progress", "wontDo"]],
			["when", ["tomorrow", "pickDate", "repeat"]],
			["edit", ["project"]],
			["remove", ["delete"]],
		]);
		expect(model.layout[model.layout.length - 1].actions[0].asks).toBe(false);
	});

	it("starts its Repeat page from the rule the tasks share, none when they differ", () => {
		const rule = { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null } as const;
		expect(taskMenu([item({ repeat: rule }), item({ repeat: rule })], T, [], [], null, { kind: "bulk" }).repeatOf.repeat).toEqual(rule);
		expect(taskMenu([item({ repeat: rule }), item()], T, [], [], null, { kind: "bulk" }).repeatOf.repeat).toBeNull();
	});
});

describe("Pick a date's places", () => {
	it("are the field's lists, the one every task goes to on", () => {
		const model = taskMenu([item()], T, [], [], null, { kind: "task", from: "day" }, [], [], [{ kind: "now" }]);
		expect(model.places).toEqual([
			{ kind: "inbox", on: false },
			{ kind: "backlog", on: false },
			{ kind: "soon", on: false },
			{ kind: "now", on: true },
		]);
	});

	it("are none for a subtask, which stands under its task, or a task that may not be put off", () => {
		const sub = item({ key: { section: "now", index: 0, path: [0], raw: "  - [ ] S" } });
		expect(taskMenu([sub], T, [], [], null, { kind: "task", from: "day" }, [], [], [{ kind: "now" }]).places).toEqual([]);
		const done = item({ can: { ...item().can, postpone: false } });
		expect(taskMenu([done], T, [], [], null, { kind: "task", from: "day" }, [], [], [{ kind: "now" }]).places).toEqual([]);
	});
});

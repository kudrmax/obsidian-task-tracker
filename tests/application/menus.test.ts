import { describe, expect, it } from "vitest";
import type { SectionOffer, TaskItem, TaskKey } from "../../core/application/contracts";
import { carriedWith, labelOn, levelOn, menuOffer, quickMoves, taskMenu, tileStatus, toggledLabels, toggledPriority } from "../../core/application/menus";
import { onDay } from "../fakes/itemOnDay";

const T = "2026-11-03";
let n = 0;
const item = (extra: Partial<TaskItem> = {}): TaskItem => {
	const i = n++;
	return onDay({ key: { section: "now", index: i, path: [], raw: `- [ ] T${i}` }, text: `T${i}`, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: extra.key?.section ?? "now", isSubtask: (extra.key?.path.length ?? 0) > 0, ...extra }, T);
};
const soon = (extra: Partial<TaskItem> = {}) => item({ key: { section: "soon", index: n, path: [], raw: `- [ ] S${n}` }, ...extra });
const P1 = { prefix: "p1", color: "red" } as const;
const P2 = { prefix: "p2", color: "orange" } as const;
const LEVELS = [P1, P2];
const RED = { name: "Важное", color: "red" } as const;
const BLUE = { name: "Срочное", color: "blue" } as const;
const LABELS = [RED, BLUE];
const ids = (task: TaskItem) => quickMoves(task, T).map((move) => move.id);

describe("the quick moves", () => {
	it("offer Today, Tomorrow and Pick a date to a task on no day, with the days they put it off to", () => {
		expect(quickMoves(soon(), T)).toEqual([
			{ id: "today", date: T },
			{ id: "tomorrow", date: "2026-11-04" },
			{ id: "pick", date: null },
		]);
	});

	it("leave out Today for a task already on today: in Now, or on today's timeline", () => {
		expect(ids(item())).toEqual(["tomorrow", "pick"]);
		expect(ids(soon({ slot: { date: T, start: 600, end: 660 } }))).toEqual(["tomorrow", "pick"]);
	});

	it("leave out Tomorrow for a task due tomorrow, and keep both for one due on a later day", () => {
		expect(ids(soon({ dueDate: "2026-11-04" }))).toEqual(["today", "pick"]);
		expect(ids(soon({ dueDate: "2026-11-09" }))).toEqual(["today", "tomorrow", "pick"]);
	});

	it("leave out the day the item says it stands on, whatever its fields", () => {
		expect(ids(soon({ day: "2026-11-04" }))).toEqual(["today", "pick"]);
		expect(ids(item({ day: null }))).toEqual(["today", "tomorrow", "pick"]);
	});

	it("put off nowhere a task the item says may not be put off, a done one among them", () => {
		expect(ids(item({ can: { ...item().can, postpone: false } }))).toEqual([]);
		expect(ids(item({ key: { section: "done", index: 0, path: [], raw: "- [x] A" }, status: "done" }))).toEqual([]);
	});

	it("of several tasks: each move any of them has, Today left out only when every one stands on today", () => {
		expect(taskMenu([item(), item()], T, [], [], null).moves.map((m) => m.id)).toEqual(["tomorrow", "pick"]);
		expect(taskMenu([item(), soon()], T, [], [], null).moves.map((m) => m.id)).toEqual(["today", "tomorrow", "pick"]);
	});
});

describe("the levels", () => {
	it("of one task: its own on, a tap on it takes it off, on another sets that one", () => {
		const own = [item({ priority: P1 })];
		expect(taskMenu(own, T, LEVELS, [], null).levels.tiles.map((t) => [t.level.prefix, t.on])).toEqual([["p1", true], ["p2", false]]);
		expect(toggledPriority(own, "p1")).toBeNull();
		expect(toggledPriority(own, "p2")).toBe("p2");
	});

	it("of several: the one they all share on, none for mixed levels, a tap on the shared one takes it off them all", () => {
		const shared = [item({ priority: P1 }), item({ priority: P1 })];
		expect(levelOn(shared, "p1")).toBe(true);
		expect(levelOn([item({ priority: P1 }), item()], "p1")).toBe(false);
		expect(toggledPriority(shared, "p1")).toBeNull();
		expect(toggledPriority([item({ priority: P1 }), item()], "p1")).toBe("p1");
	});

	it("count only the tasks that may have a priority: a task with labels neither keeps a level off nor stops it coming off", () => {
		const mixed = [item({ priority: P1 }), item({ labels: [RED] })];
		expect(levelOn(mixed, "p1")).toBe(true);
		expect(toggledPriority(mixed, "p1")).toBeNull();
	});

	it("can't be pressed while no task may have a priority", () => {
		expect(taskMenu([item({ labels: [RED] })], T, LEVELS, [], null).levels.disabled).toBe(true);
		expect(taskMenu([item({ labels: [RED] }), item()], T, LEVELS, [], null).levels.disabled).toBe(false);
	});
});

describe("the labels", () => {
	it("of one task: its own on; a tap puts one last beside the others and takes one it has off", () => {
		const one = [item({ labels: [BLUE] })];
		expect(taskMenu(one, T, [], LABELS, null).labels.tiles.map((t) => [t.label.name, t.on])).toEqual([["Важное", false], ["Срочное", true]]);
		expect(toggledLabels(one, "Важное")).toEqual([["Срочное", "Важное"]]);
		expect(toggledLabels([item({ labels: [RED, BLUE] })], "Важное")).toEqual([["Срочное"]]);
	});

	it("of several: on when every task without a priority has it; can't be pressed when every task has a priority", () => {
		const tasks = [item({ labels: [RED] }), item({ priority: P1 })];
		expect(taskMenu(tasks, T, [], LABELS, null).labels).toEqual({ tiles: [{ label: RED, on: true }, { label: BLUE, on: false }], disabled: false });
		expect(taskMenu([item({ priority: P1 })], T, [], LABELS, null).labels.disabled).toBe(true);
		expect(labelOn([item({ priority: P1 })], "Важное")).toBe(false);
	});

	it("go on each task without it, or off all that have it, and leave the tasks with a priority", () => {
		expect(toggledLabels([item({ labels: [RED] }), item(), item({ priority: P1 })], "Важное")).toEqual([["Важное"], ["Важное"], []]);
		expect(toggledLabels([item({ labels: [RED] }), item({ labels: [RED, BLUE] })], "Важное")).toEqual([[], ["Срочное"]]);
	});
});

describe("the rest of the menu", () => {
	it("offers In progress unless every task already is, then Stop progress, which takes them back to todo", () => {
		expect(taskMenu([item({ status: "inProgress" }), item()], T, [], [], null).statuses[1].id).toBe("inProgress");
		expect(taskMenu([item({ status: "inProgress" })], T, [], [], null).statuses[1].id).toBe("stopProgress");
		expect(tileStatus("stopProgress")).toBe("todo");
		expect(tileStatus("inProgress")).toBe("inProgress");
	});

	it("offers Remove due date when some task may lose its date, as the item tells", () => {
		expect(taskMenu([soon({ dueDate: T })], T, [], [], null).removeDue).toBe(false);
		expect(taskMenu([soon({ dueDate: T }), soon({ dueDate: "2026-11-05" })], T, [], [], null).removeDue).toBe(true);
		expect(taskMenu([soon({ dueDate: "2026-11-05", can: { ...item().can, removeDue: false } })], T, [], [], null).removeDue).toBe(false);
	});

	it("offers the Reminder page's kinds, Off last, the task's own checked; none without the Reminder row", () => {
		const slot = { date: T, start: 600, end: null };
		expect(taskMenu([item({ slot, reminder: "alarm" })], T, [], [], null, { kind: "task", from: "timeline" }).reminders).toEqual([
			{ kind: "live", checked: false },
			{ kind: "notification", checked: false },
			{ kind: "alarm", checked: true },
			{ kind: "none", checked: false },
		]);
		expect(taskMenu([item()], T, [], [], null, { kind: "task", from: "day" }).reminders).toEqual([]);
		expect(taskMenu([item({ slot }), item({ slot })], T, [], [], null, { kind: "bulk" }).reminders).toEqual([]);
	});

	it("shows picked the due date every task has, none when they differ", () => {
		expect(taskMenu([soon({ dueDate: "2026-11-05" }), soon({ dueDate: "2026-11-05" })], T, [], [], null).dueDate).toBe("2026-11-05");
		expect(taskMenu([soon({ dueDate: "2026-11-05" }), soon()], T, [], [], null).dueDate).toBeNull();
	});

	it("offers the sections of the tasks' one list, checked only when they all stand in one, and none without an offer", () => {
		const offer: SectionOffer = { lists: { now: ["Work", "Home"], soon: [], inbox: [], backlog: [] }, ungrouped: "No section" };
		expect(taskMenu([item({ group: "Work" }), item({ group: "Work" })], T, [], [], offer, { kind: "bulk" }).sections).toEqual({
			choice: { names: ["Work", "Home"], current: "Work", ungrouped: "No section" },
			options: [{ name: "Work", checked: true }, { name: "Home", checked: false }, { name: null, checked: false }],
			create: false,
		});
		expect(taskMenu([item({ group: "Work" }), item({ group: null })], T, [], [], offer, { kind: "bulk" }).sections?.options.some((o) => o.checked)).toBe(false);
		expect(taskMenu([item({ group: null })], T, [], [], offer).sections?.options[2]).toEqual({ name: null, checked: true });
		expect(taskMenu([item({ group: "Work" })], T, [], [], offer).sections?.create).toBe(true);
		expect(taskMenu([item(), soon()], T, [], [], offer).sections).toBeNull();
		expect(taskMenu([item()], T, [], [], null).sections).toBeNull();
	});
});

describe("the status group", () => {
	const statuses = (items: TaskItem[], of: Parameters<typeof taskMenu>[5] = { kind: "task", from: "day" }) => taskMenu(items, T, [], [], null, of).statuses;
	const EVERY_DAY = { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null } as const;

	it("offers one task Done, In progress and Won’t do, asking before Won’t do; a task done or given up too", () => {
		const expected = [{ id: "done", confirm: false }, { id: "inProgress", confirm: false }, { id: "wontDo", confirm: true }];
		expect(statuses([item()])).toEqual(expected);
		expect(statuses([item({ status: "done", open: false, list: "done" })])).toEqual(expected);
		expect(statuses([item({ status: "cancelled", open: false, list: "done" })])).toEqual(expected);
	});

	it("adds Stop last for one task that may be stopped, and asks before it", () => {
		expect(statuses([item({ repeat: EVERY_DAY, can: { ...item().can, stop: true } })])[3]).toEqual({ id: "stop", confirm: true });
		expect(statuses([item({ repeat: EVERY_DAY, can: { ...item().can, stop: false } })]).map((s) => s.id)).not.toContain("stop");
	});

	it("offers the picked tasks no Stop, and asks before nothing", () => {
		const can = { ...item().can, stop: true };
		expect(statuses([item({ can }), item({ can })], { kind: "bulk" })).toEqual([{ id: "done", confirm: false }, { id: "inProgress", confirm: false }, { id: "wontDo", confirm: false }]);
	});

	it("writes Done, In progress, todo again and given up; Stop stops", () => {
		expect((["done", "inProgress", "stopProgress", "wontDo", "stop"] as const).map(tileStatus)).toEqual(["done", "inProgress", "todo", "cancelled", null]);
	});
});

describe("the edit group", () => {
	const offer: SectionOffer = { lists: { now: ["Work"], soon: [], inbox: [], backlog: [] }, ungrouped: "No section" };
	const edits = (task: TaskItem, of: Parameters<typeof taskMenu>[5] = { kind: "task", from: "day" }, sections: SectionOffer | null = null) => taskMenu([task], T, [], [], sections, of).edits;

	it("offers Rename, Add description, Repeat and Add subtask to a task without a time or a description", () => {
		expect(edits(item())).toEqual(["rename", "description", "repeat", "subtask"]);
	});

	it("offers the reminder of a task on a time, after Rename, by what the task may have", () => {
		expect(edits(item({ description: "- note", can: { ...item().can, remind: true, addDescription: false } }))).toEqual(["rename", "reminder", "repeat", "subtask"]);
	});

	it("offers no Add description to a task that has one, no Repeat to one that may not repeat", () => {
		expect(edits(item({ can: { ...item().can, addDescription: false }, repeatable: false }))).toEqual(["rename", "subtask"]);
	});

	it("offers Section before Add subtask where the sections are offered", () => {
		expect(edits(item({ description: "- note", can: { ...item().can, addDescription: false } }), { kind: "task", from: "day" }, offer)).toEqual(["rename", "repeat", "section", "subtask"]);
	});

	it("offers no Add subtask to a subtask opened from a timeline card's stack", () => {
		const sub = item({ key: { section: "now", index: 0, path: [0], raw: "  - [ ] S" } });
		expect(edits(sub, { kind: "task", from: "stack" })).not.toContain("subtask");
		expect(edits(sub, { kind: "task", from: "timeline" })).toContain("subtask");
		expect(edits(sub, { kind: "task", from: "full" })).toContain("subtask");
	});

	it("gives the picked tasks Section alone, where it is offered", () => {
		expect(edits(item(), { kind: "bulk" })).toEqual([]);
		expect(edits(item(), { kind: "bulk" }, offer)).toEqual(["section"]);
	});
});

describe("Delete", () => {
	it("asks first in one task's menu, not in the bulk menu", () => {
		expect(taskMenu([item()], T, [], [], null).remove).toEqual({ confirm: true });
		expect(taskMenu([item(), item()], T, [], [], null, { kind: "bulk" }).remove).toEqual({ confirm: false });
	});
});

describe("where a menu offers sections", () => {
	const offer: SectionOffer = { lists: { now: ["Work"], soon: [], inbox: [], backlog: [] }, ungrouped: "No section" };
	const screen = { today: T, day: T, offer };
	const sectioned = (column: string) => (column === "day" ? null : { list: "soon" as const, date: null });

	it("from cards that all stand in columns showing their list's sections", () => {
		expect(menuOffer(["soon", "inbox"], screen, sectioned)).toBe(offer);
		expect(menuOffer(["soon", "day"], screen, sectioned)).toBeNull();
	});

	it("never from the timeline, Done, a stack or the whole screen", () => {
		for (const from of ["timeline", "done", "stack", "full"] as const) expect(menuOffer([from], screen, () => ({ list: "soon", date: null }))).toBeNull();
	});
});

describe("the picked tasks carried along", () => {
	const key = (index: number, path: number[] = []): TaskKey => ({ section: "now", index, path, raw: `- [ ] ${index}.${path.join(".")}` });

	it("are the others, without a picked subtask under a picked task: it goes with its task", () => {
		const [a, a1, b, a11] = [key(0), key(0, [0]), key(1), key(0, [0, 0])];
		expect(carriedWith(b, [a, a1, b, a11])).toEqual([a]);
		expect(carriedWith(a1, [a1, a11, b])).toEqual([b]);
		expect(carriedWith(a, [a, b])).toEqual([b]);
	});
});

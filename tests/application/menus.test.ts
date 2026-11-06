import { describe, expect, it } from "vitest";
import type { SectionOffer, TaskItem, TaskKey } from "../../src/application/contracts";
import { carriedWith, labelOn, levelOn, quickMoves, taskMenu, toggledLabels, toggledPriority } from "../../src/application/menus";
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
	it("sets In progress unless every task already is, then Stop progress takes them back to todo", () => {
		expect(taskMenu([item({ status: "inProgress" }), item()], T, [], [], null).progress).toBe("inProgress");
		expect(taskMenu([item({ status: "inProgress" })], T, [], [], null).progress).toBe("todo");
	});

	it("offers Remove due date when some task may lose its date, as the item tells", () => {
		expect(taskMenu([soon({ dueDate: T })], T, [], [], null).removeDue).toBe(false);
		expect(taskMenu([soon({ dueDate: T }), soon({ dueDate: "2026-11-05" })], T, [], [], null).removeDue).toBe(true);
		expect(taskMenu([soon({ dueDate: "2026-11-05", can: { ...item().can, removeDue: false } })], T, [], [], null).removeDue).toBe(false);
	});

	it("shows picked the due date every task has, none when they differ", () => {
		expect(taskMenu([soon({ dueDate: "2026-11-05" }), soon({ dueDate: "2026-11-05" })], T, [], [], null).dueDate).toBe("2026-11-05");
		expect(taskMenu([soon({ dueDate: "2026-11-05" }), soon()], T, [], [], null).dueDate).toBeNull();
	});

	it("offers the sections of the tasks' one list, checked only when they all stand in one, and none without an offer", () => {
		const offer: SectionOffer = { lists: { now: ["Work", "Home"], soon: [], inbox: [], backlog: [] }, ungrouped: "No section" };
		expect(taskMenu([item({ group: "Work" }), item({ group: "Work" })], T, [], [], offer).sections).toEqual({ choice: { names: ["Work", "Home"], current: "Work", ungrouped: "No section" }, shared: true });
		expect(taskMenu([item({ group: "Work" }), item({ group: null })], T, [], [], offer).sections?.shared).toBe(false);
		expect(taskMenu([item(), soon()], T, [], [], offer).sections).toBeNull();
		expect(taskMenu([item()], T, [], [], null).sections).toBeNull();
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

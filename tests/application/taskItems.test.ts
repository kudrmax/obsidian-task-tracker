import { describe, expect, it } from "vitest";
import { toItem } from "../../src/application/taskItems";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

const queried = parse("## Now\n- [ ] Plain\n- [/] Slotted today ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n\n## Done\n");
const TRIP = "## Now\n- [ ] Trip 📅 2026-11-03\n\t- [x] Compare\n\t- [/] Seats\n\t\t- [ ] Window\n\t\tnote\n\t- [ ] Pay\n- [ ] Call\n\n## Soon\n- [ ] Later\n\n## Done\n";
const described = parse([
	"## Now",
	"- [ ] Задача 1",
	"\t- Описание её",
	"\t- Ещё её описание",
	"\t- [ ] Задача 2 (подзадача)",
	"\t\t- Описание подзадачи",
	"\t- Снова описание задачи 1",
	"- [ ] Другая",
	"",
	"## Soon",
	"",
	"## Done",
	"",
].join("\n"));

describe("toItem", () => {
	it("carries the key and the fields the UI shows", () => {
		expect(toItem(queried.tasks("now")[1], T)).toEqual({
			key: { section: "now", index: 1, path: [], raw: "- [/] Slotted today ⏰ 2026-10-30 10:00-11:00" },
			text: "Slotted today",
			status: "inProgress",
			dueDate: null,
			slot: { date: T, start: 600, end: 660 },
			reminder: "notification",
			repeat: null,
			open: true,
			repeatable: true,
			priority: null,
			group: null,
			list: "now",
			isSubtask: false,
			day: T,
			can: { postpone: true, removeDue: false, remind: true },
			subtasks: [],
			progress: null,
			parentText: null, description: null,
		});
	});

	it("tells the list a task is in and whether it is a subtask, a subtask's list its task's", () => {
		const trip = toItem(parse(TRIP).tasks("now")[0], T);
		const later = toItem(parse(TRIP).tasks("soon")[0], T);
		expect([trip.list, trip.isSubtask]).toEqual(["now", false]);
		expect([later.list, later.isSubtask]).toEqual(["soon", false]);
		expect(trip.subtasks.map((s) => [s.list, s.isSubtask])).toEqual([["now", true], ["now", true]]);
		expect(trip.subtasks[0].subtasks.map((s) => [s.list, s.isSubtask])).toEqual([["now", true]]);
	});

	it("tells whether the task may repeat: an open task of its own; not a subtask, nor a closed task", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A\n\t- [ ] A1\n- [x] B\n- [-] C\n- [/] D\n", SECTIONS, M);
		const [a, b, c, dd] = d.tasks("now");
		expect([toItem(a, T).repeatable, toItem(a, T).subtasks[0].repeatable, toItem(b, T).repeatable, toItem(c, T).repeatable, toItem(dd, T).repeatable]).toEqual([true, false, false, false, true]);
	});

	it("tells whether the task is open: todo or in progress, not done nor given up", () => {
		const d = parse("## Now\n- [ ] A\n- [/] B\n- [x] C\n- [-] D\n");
		expect(d.tasks("now").map((e) => toItem(e, T).open)).toEqual([true, true, false, false]);
	});

	it("shows the open subtasks and counts the done ones among those not given up", () => {
		const item = toItem(parse("## Now\n- [ ] A\n  - [x] B\n  - [-] C\n  - [ ] D\n").tasks("now")[0], T);
		expect(item.progress).toEqual({ done: 1, total: 2 });
		expect(item.subtasks.map((s) => [s.text, s.parentText, s.key.path])).toEqual([["D", "A", [2]]]);
		expect(toItem(parse(TRIP).tasks("now")[1], T).progress).toBeNull();
	});

	it("carries the description of the task and of its subtasks", () => {
		expect(toItem(described.tasks("now")[0], T).description).toBe("- Описание её\n- Ещё её описание\n- Снова описание задачи 1");
		expect(toItem(described.tasks("now")[0], T).subtasks[0].description).toBe("- Описание подзадачи");
		expect(toItem(described.tasks("now")[1], T).description).toBeNull();
	});
});

describe("toItem on a day", () => {
	const d = parse("## Now\n- [ ] Plain\n- [ ] Due today 📅 2026-10-30\n- [ ] Due later 📅 2026-11-03\n\n## Soon\n- [ ] Undated\n- [ ] Dated 📅 2026-11-03\n- [ ] On a slot 📅 2026-11-04 ⏰ 2026-11-02 10:00\n\n## Done\n- [x] Closed 📅 2026-11-03\n");

	it("stands on its slot's day, on today in Now, else on its due date", () => {
		expect(d.tasks("now").map((e) => toItem(e, T).day)).toEqual([T, T, T]);
		expect(d.tasks("soon").map((e) => toItem(e, T).day)).toEqual([null, "2026-11-03", "2026-11-02"]);
		expect(toItem(parse(TRIP).tasks("now")[0], T).subtasks.map((s) => s.day)).toEqual([T, T]);
	});

	it("may be put off unless done, and its due date taken off unless it has none or today's", () => {
		expect(d.tasks("now").map((e) => toItem(e, T).can)).toEqual([
			{ postpone: true, removeDue: false, remind: false },
			{ postpone: true, removeDue: false, remind: false },
			{ postpone: true, removeDue: true, remind: false },
		]);
		expect(toItem(d.tasks("soon")[0], T).can).toEqual({ postpone: true, removeDue: false, remind: false });
		expect(toItem(d.tasks("done")[0], T).can).toEqual({ postpone: false, removeDue: true, remind: false });
	});

	it("reminds only on a time", () => {
		expect(d.tasks("soon").map((e) => toItem(e, T).can.remind)).toEqual([false, false, true]);
	});
});

describe("toItem with priority levels", () => {
	const RED = { prefix: "p1", color: "red" } as const;
	const levelOf = (prefix: string) => (prefix === "p1" ? RED : null);

	it("gives the level of the task's prefix, none without one", () => {
		const d = TaskDocument.parse("## Now\n- [ ] p1 A\n- [ ] B\n", SECTIONS, { ...M, priorities: ["p1"] });
		expect(toItem(d.tasks("now")[0], T, levelOf)).toMatchObject({ text: "A", priority: RED });
		expect(toItem(d.tasks("now")[1], T, levelOf).priority).toBeNull();
	});
});

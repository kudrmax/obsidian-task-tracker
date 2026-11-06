import { describe, expect, it } from "vitest";
import { itemLevels, toItem } from "../../src/application/taskItems";
import { DayBoundary } from "../../src/domain/DayBoundary";
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
			title: "Slotted today",
			status: "inProgress",
			dueDate: null,
			slot: { date: T, start: 600, end: 660 },
			durationMin: 60,
			reminder: "notification",
			repeat: null,
			open: true,
			repeatable: true,
			priority: null,
			labels: [],
			group: null,
			list: "now",
			isSubtask: false,
			day: T,
			repeatDay: T,
			can: { postpone: true, removeDue: false, remind: true, setPriority: true, setLabels: true, stop: false, addDescription: true, fold: false },
			subtasks: [],
			allSubtasks: [],
			progress: null,
			collapsed: false,
			parentText: null,
			parentKey: null,
			description: null,
		});
	});

	it("a new rule's day: the day setRepeat anchors at, its due date, else its slot's by the day's boundary; else today", () => {
		const doc = parse("## Now\n- [ ] Due 📅 2026-11-03\n- [ ] Slot ⏰ 2026-11-07 10:00\n- [ ] Late ⏰ 2026-11-07 02:00\n- [ ] Plain\n\n## Soon\n\n## Done\n");
		const days = (boundary?: DayBoundary) => doc.tasks("now").map((e) => toItem(e, T, undefined, null, boundary).repeatDay);
		expect(days()).toEqual(["2026-11-03", "2026-11-07", "2026-11-07", T]);
		expect(days(new DayBoundary(4))).toEqual(["2026-11-03", "2026-11-07", "2026-11-06", T]);
	});

	it("tells the list a task is in and whether it is a subtask, a subtask's list its task's", () => {
		const trip = toItem(parse(TRIP).tasks("now")[0], T);
		const later = toItem(parse(TRIP).tasks("soon")[0], T);
		expect([trip.list, trip.isSubtask]).toEqual(["now", false]);
		expect([later.list, later.isSubtask]).toEqual(["soon", false]);
		expect(trip.subtasks.map((s) => [s.list, s.isSubtask])).toEqual([["now", true], ["now", true]]);
		expect(trip.subtasks[0].subtasks.map((s) => [s.list, s.isSubtask])).toEqual([["now", true]]);
	});

	it("tells whether the task may repeat: an open task or subtask; not a closed task", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A\n\t- [ ] A1\n- [x] B\n- [-] C\n- [/] D\n", SECTIONS, M);
		const [a, b, c, dd] = d.tasks("now");
		expect([toItem(a, T).repeatable, toItem(a, T).subtasks[0].repeatable, toItem(b, T).repeatable, toItem(c, T).repeatable, toItem(dd, T).repeatable]).toEqual([true, true, false, false, true]);
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

	it("carries every subtask too, done and given up ones among them, in file order", () => {
		const item = toItem(parse("## Now\n- [ ] A\n  - [x] B\n    - [ ] B1\n  - [-] C\n  - [ ] D\n").tasks("now")[0], T);
		expect(item.allSubtasks.map((s) => [s.text, s.status, s.key.path])).toEqual([["B", "done", [0]], ["C", "cancelled", [1]], ["D", "todo", [2]]]);
		expect(item.allSubtasks[0].allSubtasks.map((s) => [s.text, s.parentText])).toEqual([["B1", "B"]]);
		expect(item.subtasks).toEqual([item.allSubtasks[2]]);
	});

	it("tells a task is collapsed only while it has an open subtask to fold", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A 📁\n  - [ ] B\n- [ ] C 📁\n  - [x] D\n- [ ] E\n  - [ ] F\n", SECTIONS, { ...M, collapsed: "📁" });
		expect(d.tasks("now").map((e) => toItem(e, T).collapsed)).toEqual([true, false, false]);
		expect(toItem(d.tasks("now")[0], T).subtasks.map((s) => s.text)).toEqual(["B"]);
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
		const pick = ({ postpone, removeDue, remind, setPriority, setLabels }: ReturnType<typeof toItem>["can"]) => ({ postpone, removeDue, remind, setPriority, setLabels });
		expect(d.tasks("now").map((e) => pick(toItem(e, T).can))).toEqual([
			{ postpone: true, removeDue: false, remind: false, setPriority: true, setLabels: true },
			{ postpone: true, removeDue: false, remind: false, setPriority: true, setLabels: true },
			{ postpone: true, removeDue: true, remind: false, setPriority: true, setLabels: true },
		]);
		expect(pick(toItem(d.tasks("soon")[0], T).can)).toEqual({ postpone: true, removeDue: false, remind: false, setPriority: true, setLabels: true });
		expect(pick(toItem(d.tasks("done")[0], T).can)).toEqual({ postpone: false, removeDue: true, remind: false, setPriority: true, setLabels: true });
	});

	it("has a title with each link's word in its place", () => {
		const linked = parse("## Now\n- [ ] Позвонить [[Люди/Петя|Пете]] про [договор](https://x.ru)\n\n## Soon\n\n## Done\n");
		expect(toItem(linked.tasks("now")[0], T).title).toBe("Позвонить Пете про договор");
	});

	it("reminds only on a time", () => {
		expect(d.tasks("soon").map((e) => toItem(e, T).can.remind)).toEqual([false, false, true]);
	});
});

describe("toItem with priority levels", () => {
	const RED = { prefix: "p1", color: "red" } as const;
	const levelOf = itemLevels([RED], []);

	it("gives the level of the task's prefix, none without one", () => {
		const d = TaskDocument.parse("## Now\n- [ ] p1 A\n- [ ] B\n", SECTIONS, { ...M, priorities: ["p1"] });
		expect(toItem(d.tasks("now")[0], T, levelOf)).toMatchObject({ text: "A", priority: RED });
		expect(toItem(d.tasks("now")[1], T, levelOf).priority).toBeNull();
	});
});

describe("toItem with labels", () => {
	const RED = { prefix: "p1", color: "red" } as const;
	const URGENT = { name: "Срочное", color: "orange" } as const;
	const IMPORTANT = { name: "Важное", color: "red" } as const;
	const levels = itemLevels([RED], [IMPORTANT, URGENT]);
	const markers = { ...M, priorities: ["p1"], labelTag: "label", labels: ["Важное", "Срочное"] };

	it("gives the task's labels in the settings' order, whatever order the line has them in", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A #label/Срочное #label/Важное\n", SECTIONS, markers);
		expect(toItem(d.tasks("now")[0], T, levels)).toMatchObject({ text: "A", labels: [IMPORTANT, URGENT], priority: null });
	});

	it("gives a task with a priority no labels, though its line has both", () => {
		const d = TaskDocument.parse("## Now\n- [ ] p1 A #label/Срочное\n", SECTIONS, markers);
		expect(toItem(d.tasks("now")[0], T, levels)).toMatchObject({ priority: RED, labels: [] });
	});
});

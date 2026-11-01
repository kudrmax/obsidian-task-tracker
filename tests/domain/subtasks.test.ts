import { describe, expect, it } from "vitest";
import { normalize } from "../../src/domain/normalize";
import { createSubtask, moveBefore, newTask, moveToList, moveToSoon, nest, placeTask, postpone, remove, setSlot, setStatus } from "../../src/domain/operations";
import { toItem } from "../../src/domain/queries";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const D = "2026-11-03";
const TRIP = "## Now\n- [ ] Trip 📅 2026-11-03\n\t- [x] Compare\n\t- [/] Seats\n\t\t- [ ] Window\n\t\tnote\n\t- [ ] Pay\n- [ ] Call\n\n## Soon\n- [ ] Later\n\n## Done\n";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("the subtask tree", () => {
	const doc = parse(TRIP);
	const trip = doc.tasks("now")[0];

	it("reads the task lines under a task as its subtasks, at any depth, keeping the file as it is", () => {
		expect(trip.subtasks.map((s) => s.task.text)).toEqual(["Compare", "Seats", "Pay"]);
		expect(trip.subtasks[1].subtasks.map((s) => s.task.text)).toEqual(["Window"]);
		expect(doc.tasks("now").map((e) => e.task.text)).toEqual(["Trip", "Call"]);
		expect(doc.serialize()).toBe(TRIP);
	});

	it("places a subtask by its task's index and the path down to it", () => {
		expect(trip.subtasks[1].subtasks[0]).toMatchObject({ section: "now", index: 0, path: [1, 0], raw: "\t\t- [ ] Window" });
		expect(doc.find("now", 0, [1, 0])?.task.text).toBe("Window");
		expect(doc.find("now", 0, [5])).toBeUndefined();
	});

	it("keeps the notes under a subtask with it", () => {
		expect(trip.subtasks[1].task.children).toEqual(["\t\t- [ ] Window", "\t\tnote"]);
	});

	it("shows the open subtasks and counts the done ones among those not given up", () => {
		const item = toItem(parse("## Now\n- [ ] A\n  - [x] B\n  - [-] C\n  - [ ] D\n").tasks("now")[0]);
		expect(item.progress).toEqual({ done: 1, total: 2 });
		expect(item.subtasks.map((s) => [s.text, s.parentText, s.key.path])).toEqual([["D", "A", [2]]]);
		expect(toItem(doc.tasks("now")[1]).progress).toBeNull();
	});
});

describe("changing a subtask", () => {
	it("rewrites its own line only", () => {
		const doc = parse(TRIP);
		const out = setStatus(doc, doc.find("now", 0, [1, 0])!, "done").serialize();
		expect(out).toBe(TRIP.replace("\t\t- [ ] Window", "\t\t- [x] Window"));
	});

	it("is removed with its own subtasks", () => {
		const doc = parse(TRIP);
		expect(remove(doc, doc.find("now", 0, [1])!).serialize()).toBe("## Now\n- [ ] Trip 📅 2026-11-03\n\t- [x] Compare\n\t- [ ] Pay\n- [ ] Call\n\n## Soon\n- [ ] Later\n\n## Done\n");
	});

	it("stays under its task when it is done: only the task goes to Done, with all of them", () => {
		const doc = parse(TRIP);
		const done = normalize(setStatus(doc, doc.find("now", 0, [2])!, "done"), T);
		expect(done.tasks("now")[0].subtasks[2].task.status).toBe("done");
		const all = normalize(setStatus(done, done.tasks("now")[0], "done"), T).serialize();
		expect(all).toContain("## Done\n- [x] Trip 📅 2026-11-03\n\t- [x] Compare\n\t- [/] Seats\n\t\t- [ ] Window\n\t\tnote\n\t- [x] Pay\n");
	});
});

describe("adding a subtask", () => {
	const draft = (placement: Parameters<typeof placeTask>[2]["placement"]) => ({ text: " Bag ", placement, priority: null });

	it("puts it last under the task, at its subtasks' indent", () => {
		const doc = parse(TRIP);
		const out = createSubtask(doc, doc.tasks("now")[0], draft({ kind: "date", date: D }), T).serialize();
		expect(out).toContain("\t- [ ] Pay\n\t- [ ] Bag\n- [ ] Call\n");
	});

	it("goes one level deeper by the file's own step under a task without subtasks", () => {
		const doc = parse("## Now\n- [ ] A\n    - [ ] B\n- [ ] C\n");
		expect(createSubtask(doc, doc.tasks("now")[1], draft({ kind: "now" }), T).serialize()).toBe("## Now\n- [ ] A\n    - [ ] B\n- [ ] C\n    - [ ] Bag\n");
		const plain = parse("## Now\n- [ ] C\n");
		expect(createSubtask(plain, plain.tasks("now")[0], draft({ kind: "now" }), T).serialize()).toBe("## Now\n- [ ] C\n\t- [ ] Bag\n");
	});

	it("takes a due date only for a placement other than its task's", () => {
		const doc = parse("## Now\n- [ ] C\n\n## Soon\n- [ ] S\n");
		const now = doc.tasks("now")[0];
		const soon = doc.tasks("soon")[0];
		expect(createSubtask(doc, now, draft({ kind: "now" }), T).serialize()).toContain("\t- [ ] Bag\n");
		expect(createSubtask(doc, now, draft({ kind: "date", date: D }), T).serialize()).toContain("\t- [ ] Bag 📅 2026-11-03\n");
		expect(createSubtask(doc, soon, draft({ kind: "now" }), T).serialize()).toContain("\t- [ ] Bag 📅 2026-10-30\n");
		expect(createSubtask(doc, soon, draft({ kind: "inbox" }), T).serialize()).toContain("- [ ] S\n\t- [ ] Bag\n");
	});

	it("edited on the sheet, a subtask keeps its place and only its due date follows the placement", () => {
		const doc = parse("## Soon\n- [ ] S\n\t- [ ] Bag 📅 2026-11-03\n");
		const bag = doc.find("soon", 0, [0])!;
		expect(placeTask(doc, bag, { text: "Bag2", placement: { kind: "date", date: D }, priority: null }, T).serialize()).toBe("## Soon\n- [ ] S\n\t- [ ] Bag2 📅 2026-11-03\n");
		expect(placeTask(doc, bag, { text: "Bag", placement: { kind: "now" }, priority: null }, T).serialize()).toBe("## Soon\n- [ ] S\n\t- [ ] Bag 📅 2026-10-30\n");
		expect(placeTask(doc, bag, { text: "Bag", placement: { kind: "inbox" }, priority: null }, T).serialize()).toBe("## Soon\n- [ ] S\n\t- [ ] Bag\n");
	});
});

describe("moving under a task and out", () => {
	it("nests a task, its own subtasks and notes going one level deeper with it", () => {
		const doc = parse("## Now\n- [ ] A\n\t- [ ] A1\n- [ ] B\n\t- [ ] B1\n\tnote\n");
		const out = nest(doc, doc.tasks("now")[1], doc.tasks("now")[0], null).serialize();
		expect(out).toBe("## Now\n- [ ] A\n\t- [ ] A1\n\t- [ ] B\n\t\t- [ ] B1\n\t\tnote\n");
	});

	it("nests right before a subtask, from above or below", () => {
		const doc = parse("## Now\n- [ ] X\n- [ ] A\n\t- [ ] A1\n\t- [ ] A2\n- [ ] Y\n");
		const a = doc.tasks("now")[1];
		expect(nest(doc, doc.tasks("now")[0], a, a.subtasks[1]).serialize()).toBe("## Now\n- [ ] A\n\t- [ ] A1\n\t- [ ] X\n\t- [ ] A2\n- [ ] Y\n");
		expect(nest(doc, doc.tasks("now")[2], a, a.subtasks[0]).serialize()).toBe("## Now\n- [ ] X\n- [ ] A\n\t- [ ] Y\n\t- [ ] A1\n\t- [ ] A2\n");
	});

	it("reorders the subtasks of one task", () => {
		const doc = parse("## Now\n- [ ] A\n\t- [ ] A1\n\t- [ ] A2\n\t- [ ] A3\n");
		const a = doc.tasks("now")[0];
		expect(nest(doc, a.subtasks[0], a, null).serialize()).toBe("## Now\n- [ ] A\n\t- [ ] A2\n\t- [ ] A3\n\t- [ ] A1\n");
		expect(nest(doc, a.subtasks[2], a, a.subtasks[0]).serialize()).toBe("## Now\n- [ ] A\n\t- [ ] A3\n\t- [ ] A1\n\t- [ ] A2\n");
		expect(nest(doc, a.subtasks[1], a, a.subtasks[1])).toBe(doc);
	});

	it("never puts a task under itself or under one of its own subtasks", () => {
		const doc = parse(TRIP);
		const trip = doc.tasks("now")[0];
		expect(() => nest(doc, trip, trip.subtasks[1], null)).toThrow();
		expect(() => nest(doc, trip, trip, null)).toThrow();
	});

	it("takes a subtask out to the list as a task before another task", () => {
		const doc = parse(TRIP);
		const out = moveBefore(doc, doc.find("now", 0, [1])!, doc.tasks("now")[1], T, T).serialize();
		expect(out).toBe("## Now\n- [ ] Trip 📅 2026-11-03\n\t- [x] Compare\n\t- [ ] Pay\n- [/] Seats 📅 2026-10-30\n\t- [ ] Window\n\tnote\n- [ ] Call\n\n## Soon\n- [ ] Later\n\n## Done\n");
	});

	it("lets a subtask go to another column or the timeline as a task", () => {
		const doc = parse(TRIP);
		const pay = () => doc.find("now", 0, [2])!;
		expect(moveToSoon(doc, pay(), T, T).tasks("soon").map((e) => e.task.text)).toEqual(["Later", "Pay"]);
		expect(postpone(doc, pay(), D, T).tasks("soon").map((e) => [e.task.text, e.task.dueDate])).toEqual([["Later", null], ["Pay", D]]);
		expect(moveToList(doc, pay(), D, T).tasks("now").map((e) => [e.task.text, e.task.dueDate])).toEqual([["Trip", D], ["Call", null], ["Pay", D]]);
		const slotted = setSlot(doc, pay(), { date: T, start: 600, end: 660 }, T);
		expect(slotted.tasks("now")[2]).toMatchObject({ path: [], raw: "- [ ] Pay ⏰ 2026-10-30 10:00-11:00" });
		expect(slotted.tasks("now")[0].subtasks.map((s) => s.task.text)).toEqual(["Compare", "Seats"]);
	});
});

describe("insertUnder with before", () => {
	it("puts the new subtask right above `before`, whose own subtree stays after it", () => {
		const doc = parse(TRIP);
		const trip = doc.tasks("now")[0];
		const out = doc.insertUnder(trip, newTask("New"), trip.subtasks[1]).serialize();
		expect(out).toBe("## Now\n- [ ] Trip 📅 2026-11-03\n\t- [x] Compare\n\t- [ ] New\n\t- [/] Seats\n\t\t- [ ] Window\n\t\tnote\n\t- [ ] Pay\n- [ ] Call\n\n## Soon\n- [ ] Later\n\n## Done\n");
	});

	it("without `before` still adds the last subtask", () => {
		const doc = parse(TRIP);
		const trip = doc.tasks("now")[0];
		expect(doc.insertUnder(trip, newTask("New"), null).serialize()).toBe(doc.insertUnder(trip, newTask("New")).serialize());
	});
});

import { describe, expect, it } from "vitest";
import {
	clearSlot,
	createAtTime,
	createGroup,
	createInList,
	groupIndex,
	createInSoon,
	moveBefore,
	moveGroupTo,
	moveToGroup,
	moveToEnd,
	moveToList,
	moveToSoon,
	newTask,
	placeTask,
	placementOfEntry,
	presetPlace,
	removeGroup,
	renameGroup,
	postpone,
	remove,
	rename,
	setDueDate,
	setPriority,
	setSlot,
	setStatus,
} from "../../src/domain/operations";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { normalize } from "../../src/domain/normalize";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const D = "2026-11-03";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("newTask", () => {
	it("builds a todo task and applies the patch", () => {
		expect(newTask("A")).toEqual({ status: "todo", statusChar: " ", text: "A", dueDate: null, slot: null, priority: null, children: [] });
		expect(newTask("A", { dueDate: D }).dueDate).toBe(D);
	});
});

describe("create", () => {
	it("createInList today lands at the end of Now, due today", () => {
		expect(createInList(parse("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n"), T, T, "New").serialize()).toBe("## Now\n- [ ] A\n- [ ] New 📅 2026-10-30\n\n## Soon\n- [ ] C\n");
	});

	it("createInList on another day lands at the end of Soon with the due date", () => {
		expect(createInList(parse("## Now\n\n## Soon\n- [ ] C\n"), D, T, "New").serialize()).toBe("## Now\n\n## Soon\n- [ ] C\n- [ ] New 📅 2026-11-03\n");
	});

	it("createInSoon lands at the end of Soon without fields", () => {
		expect(createInSoon(parse("## Soon\n- [ ] C\n\n## Done\n"), "New").serialize()).toBe("## Soon\n- [ ] C\n- [ ] New\n\n## Done\n");
	});

	it("createAtTime today lands in Now with a slot at the time, without a duration", () => {
		expect(createAtTime(parse("## Now\n\n## Soon\n"), T, T, 600, "New").serialize()).toBe("## Now\n- [ ] New ⏰ 2026-10-30 10:00\n\n## Soon\n");
	});

	it("createAtTime counts the day from its start hour: 3:00 on the 31st belongs to the 30th", () => {
		expect(createAtTime(parse("## Now\n\n## Soon\n"), "2026-10-31", T, 180, "Late", new DayBoundary(4)).serialize()).toBe("## Now\n- [ ] Late ⏰ 2026-10-31 03:00\n\n## Soon\n");
	});

	it("createAtTime on another day lands in Soon", () => {
		expect(createAtTime(parse("## Now\n\n## Soon\n"), D, T, 1410, "New").serialize()).toBe("## Now\n\n## Soon\n- [ ] New ⏰ 2026-11-03 23:30\n");
	});
});

describe("edit", () => {
	it("setStatus rewrites the status char", () => {
		const d = parse("## Now\n- [ ] A\n");
		expect(setStatus(d, d.tasks("now")[0], "inProgress").serialize()).toBe("## Now\n- [/] A\n");
		expect(setStatus(d, d.tasks("now")[0], "done").serialize()).toBe("## Now\n- [x] A\n");
		expect(setStatus(d, d.tasks("now")[0], "cancelled").serialize()).toBe("## Now\n- [-] A\n");
		const inProgress = setStatus(d, d.tasks("now")[0], "inProgress");
		expect(setStatus(inProgress, inProgress.tasks("now")[0], "todo").serialize()).toBe("## Now\n- [ ] A\n");
	});

	it("setDueDate sets and removes the due date", () => {
		const d = parse("## Now\n- [ ] A\n");
		const withDate = setDueDate(d, d.tasks("now")[0], D);
		expect(withDate.serialize()).toBe("## Now\n- [ ] A 📅 2026-11-03\n");
		expect(setDueDate(withDate, withDate.tasks("now")[0], null).serialize()).toBe("## Now\n- [ ] A\n");
	});

	it("rename keeps the fields and trims the text", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-11-03\n");
		expect(rename(d, d.tasks("now")[0], "  B  ").serialize()).toBe("## Now\n- [ ] B 📅 2026-11-03\n");
	});

	it("remove takes the children along", () => {
		const d = parse("## Now\n- [ ] A\n  - x\n- [ ] B\n");
		expect(remove(d, d.tasks("now")[0]).serialize()).toBe("## Now\n- [ ] B\n");
	});
});

describe("moveBefore", () => {
	it("puts the task right before the target in the target's section; into Now it comes due today", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B 📅 2026-10-30\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveBefore(d, d.tasks("now")[0], d.tasks("soon")[1], T, T).serialize()).toBe("## Now\n- [ ] B 📅 2026-10-30\n\n## Soon\n- [ ] C\n- [ ] A\n- [ ] D\n");
		expect(moveBefore(d, d.tasks("now")[1], d.tasks("now")[0], T, T).serialize()).toBe("## Now\n- [ ] B 📅 2026-10-30\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveBefore(d, d.tasks("soon")[0], d.tasks("now")[0], T, T).serialize()).toBe("## Now\n- [ ] C 📅 2026-10-30\n- [ ] A\n- [ ] B 📅 2026-10-30\n\n## Soon\n- [ ] D\n");
	});

	it("with no target goes to the end of Now today and the end of Soon on another day", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n");
		expect(moveBefore(d, d.tasks("now")[0], null, T, T).serialize()).toBe("## Now\n- [ ] B\n- [ ] A 📅 2026-10-30\n\n## Soon\n- [ ] C\n");
		expect(moveBefore(d, d.tasks("now")[0], null, D, T).serialize()).toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A\n");
	});

	it("does nothing when the target is the task itself", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n");
		expect(moveBefore(d, d.tasks("now")[0], d.tasks("now")[0], T, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n");
	});
});

describe("slots", () => {
	it("setSlot today keeps the section and writes the slot", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n");
		expect(setSlot(d, d.tasks("now")[0], { date: T, start: 600, end: 660 }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B\n");
	});

	it("setSlot on another day moves a Now task to the end of Soon", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n");
		expect(setSlot(d, d.tasks("now")[0], { date: "2026-10-31", start: 600, end: 660 }, T).serialize()).toBe(
			"## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A ⏰ 2026-10-31 10:00-11:00\n",
		);
	});

	it("setSlot on another day takes today's due date off the Now task it moves to Soon", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-10-30\n- [ ] B 📅 2026-11-05\n\n## Soon\n");
		expect(setSlot(d, d.tasks("now")[0], { date: D, start: 600, end: 660 }, T).serialize()).toBe(
			"## Now\n- [ ] B 📅 2026-11-05\n\n## Soon\n- [ ] A ⏰ 2026-11-03 10:00-11:00\n",
		);
		expect(setSlot(d, d.tasks("now")[1], { date: D, start: 600, end: 660 }, T).serialize()).toBe(
			"## Now\n- [ ] A 📅 2026-10-30\n\n## Soon\n- [ ] B 📅 2026-11-05 ⏰ 2026-11-03 10:00-11:00\n",
		);
	});

	it("setSlot on another day leaves a Soon task where it is", () => {
		const d = parse("## Soon\n- [ ] C\n- [ ] A\n");
		expect(setSlot(d, d.tasks("soon")[0], { date: D, start: 600, end: 660 }, T).serialize()).toBe("## Soon\n- [ ] C ⏰ 2026-11-03 10:00-11:00\n- [ ] A\n");
	});

	it("setSlot after midnight of today keeps a Now task in Now when the day starts later", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n");
		expect(setSlot(d, d.tasks("now")[0], { date: "2026-10-31", start: 60, end: 120 }, T, new DayBoundary(4)).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n");
	});

	it("setSlot clamps the slot to the day", () => {
		const d = parse("## Now\n- [ ] A\n");
		expect(setSlot(d, d.tasks("now")[0], { date: T, start: 1420, end: 1480 }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 23:40-24:00\n");
	});

	it("clearSlot drops the slot and keeps the due date and the section", () => {
		const d = parse("## Soon\n- [ ] A 📅 2026-11-03 ⏰ 2026-11-03 10:00-11:00\n");
		expect(clearSlot(d, d.tasks("soon")[0]).serialize()).toBe("## Soon\n- [ ] A 📅 2026-11-03\n");
	});

	it("setSlot writes a slot without a duration as its start alone", () => {
		const d = parse("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n");
		expect(setSlot(d, d.tasks("now")[0], { date: T, start: 630, end: null }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 10:30\n");
	});

});

describe("between the list and Soon", () => {
	it("moveToList today moves to the end of Now, due today", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveToList(d, d.tasks("soon")[0], T, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] C 📅 2026-10-30\n\n## Soon\n- [ ] D\n");
	});

	it("moveToList on another day sets the due date and keeps the section", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveToList(d, d.tasks("soon")[0], D, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] C 📅 2026-11-03\n- [ ] D\n");
	});

	it("moveToSoon today moves to the end of Soon without the due date", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-10-30\n- [ ] B\n\n## Soon\n- [ ] C\n");
		expect(moveToSoon(d, d.tasks("now")[0], T, T).serialize()).toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A\n");
	});

	it("moveToSoon on another day drops the due date and keeps the section", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-11-03\n\n## Soon\n- [ ] C 📅 2026-11-03\n");
		expect(moveToSoon(d, d.tasks("now")[0], D, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] C 📅 2026-11-03\n");
		expect(moveToSoon(d, d.tasks("soon")[0], D, T).serialize()).toBe("## Now\n- [ ] A 📅 2026-11-03\n\n## Soon\n- [ ] C\n");
	});
});

describe("placeTask", () => {
	const BASE = "## Now\n- [ ] A\n\n## Soon\n- [ ] S\n\n## Done\n";

	it("creates at the end of Soon without a due date", () => {
		expect(placeTask(parse(BASE), null, { text: " New ", placement: { kind: "soon" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n- [ ] New\n\n## Done\n");
	});

	it("creates at the end of Now, due today", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "now" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] New 📅 2026-10-30\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("creates with a date today or earlier at the end of Now with the due date", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "date", date: T }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] New 📅 2026-10-30\n\n## Soon\n- [ ] S\n\n## Done\n");
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "date", date: "2026-10-01" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] New 📅 2026-10-01\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("creates with a date after today at the end of Soon with the due date", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "date", date: D }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n- [ ] New 📅 2026-11-03\n\n## Done\n");
	});

	it("creates with a slot and keeps it", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "now" }, priority: null }, T, { date: T, start: 990, end: 1050 }).serialize()).toBe(
			"## Now\n- [ ] A\n- [ ] New 📅 2026-10-30 ⏰ 2026-10-30 16:30-17:30\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("edits with the same placement in place, text only", () => {
		const d = parse("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A2", placement: { kind: "now" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A2 ⏰ 2026-10-30 10:00-11:00\n- [ ] B 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("now")[1], { text: "B2", placement: { kind: "date", date: D }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B2 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "S2", placement: { kind: "soon" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S2\n");
	});

	it("edits from now to soon: end of Soon, due date dropped, slot and children kept", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-30 10:00-11:00\n  - note\n- [ ] B\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A2", placement: { kind: "soon" }, priority: null }, T).serialize()).toBe(
			"## Now\n- [ ] B\n\n## Soon\n- [ ] S\n- [ ] A2 ⏰ 2026-10-30 10:00-11:00\n  - note\n",
		);
	});

	it("edits from soon to a date: due date set, section by the date", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n- [ ] R\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "S", placement: { kind: "date", date: D }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S 📅 2026-11-03\n- [ ] R\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "S", placement: { kind: "date", date: T }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] S 📅 2026-10-30\n\n## Soon\n- [ ] R\n");
	});

	it("edits from another date to now: due today, at the end of Now", () => {
		const d = parse("## Now\n- [ ] B\n\n## Soon\n- [ ] A 📅 2026-11-03\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "A", placement: { kind: "now" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] B\n- [ ] A 📅 2026-10-30\n\n## Soon\n");
	});

	it("a changed date within the same section keeps the position", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-10-29\n- [ ] B\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A", placement: { kind: "date", date: T }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A 📅 2026-10-30\n- [ ] B\n");
	});
});

describe("placementOf", () => {
	it("returns Now for today's due date, the date for another one, else the section", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-11-03\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Soon\n- [ ] S\n\n## Done\n- [x] X\n");
		expect(placementOfEntry(d.tasks("now")[0], T)).toEqual({ kind: "date", date: D });
		expect(placementOfEntry(d.tasks("now")[1], T)).toEqual({ kind: "now" });
		expect(placementOfEntry(d.tasks("now")[2], T)).toEqual({ kind: "now" });
		expect(placementOfEntry(d.tasks("soon")[0], T)).toEqual({ kind: "soon" });
		expect(placementOfEntry(d.tasks("done")[0], T)).toEqual({ kind: "now" });
	});
});

describe("placeTask keeps the position when only the date changes within a section", () => {
	it("stays in place in Soon", () => {
		const d = parse("## Now\n\n## Soon\n- [ ] A 📅 2026-11-05\n- [ ] B\n");
		const out = placeTask(d, d.tasks("soon")[0], { text: "A", placement: { kind: "date", date: "2026-11-06" }, priority: null }, "2026-10-30");
		expect(out.serialize()).toBe("## Now\n\n## Soon\n- [ ] A 📅 2026-11-06\n- [ ] B\n");
	});
});

describe("Inbox", () => {
	const text = "## Inbox\n- [ ] I\n\n## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n- [ ] S\n\n## Done\n";

	it("the Inbox tile creates at the end of Inbox and drops a slot", () => {
		const slot = { date: T, start: 600, end: null };
		expect(placeTask(parse(text), null, { text: "New", placement: { kind: "inbox" }, priority: null }, T, slot).serialize()).toBe(
			"## Inbox\n- [ ] I\n- [ ] New\n\n## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("an edit to Inbox takes the due date and the slot away", () => {
		const d = parse(text);
		expect(placeTask(d, d.tasks("now")[0], { text: "A", placement: { kind: "inbox" }, priority: null }, T).serialize()).toBe("## Inbox\n- [ ] I\n- [ ] A\n\n## Now\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("an Inbox task shows the Inbox tile", () => {
		expect(placementOfEntry(parse(text).tasks("inbox")[0], T)).toEqual({ kind: "inbox" });
	});

	it("moveToEnd moves between Inbox and Soon, and to the end of its own section", () => {
		const d = parse("## Inbox\n- [ ] I\n- [ ] J\n\n## Soon\n- [ ] S\n- [ ] T\n");
		expect(moveToEnd(d, d.tasks("inbox")[0], "soon").serialize()).toBe("## Inbox\n- [ ] J\n\n## Soon\n- [ ] S\n- [ ] T\n- [ ] I\n");
		expect(moveToEnd(d, d.tasks("soon")[0], "inbox").serialize()).toBe("## Inbox\n- [ ] I\n- [ ] J\n- [ ] S\n\n## Soon\n- [ ] T\n");
		expect(moveToEnd(d, d.tasks("soon")[0], "soon").serialize()).toBe("## Inbox\n- [ ] I\n- [ ] J\n\n## Soon\n- [ ] T\n- [ ] S\n");
	});

	it("moveToEnd into Inbox drops the due date and the slot", () => {
		const d = parse("## Inbox\n\n## Soon\n- [ ] S 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00\n");
		expect(moveToEnd(d, d.tasks("soon")[0], "inbox").serialize()).toBe("## Inbox\n- [ ] S\n\n## Soon\n");
	});
});

describe("priority", () => {
	const P = { ...M, priorities: ["p1", "p2"] };
	const doc = (text: string) => TaskDocument.parse(text, SECTIONS, P);

	it("setPriority replaces the prefix, and null takes it off", () => {
		const d = doc("## Now\n- [ ] p1 X\n");
		expect(setPriority(d, d.tasks("now")[0], "p2").serialize()).toBe("## Now\n- [ ] p2 X\n");
		expect(setPriority(d, d.tasks("now")[0], null).serialize()).toBe("## Now\n- [ ] X\n");
	});

	it("placeTask writes the draft's priority on a new task and keeps one prefix on an edited one", () => {
		const d = doc("## Now\n- [ ] p1 A\n\n## Soon\n");
		expect(placeTask(d, null, { text: "New", placement: { kind: "now" }, priority: "p1" }, T).serialize()).toBe("## Now\n- [ ] p1 A\n- [ ] p1 New 📅 2026-10-30\n\n## Soon\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A2", placement: { kind: "now" }, priority: "p1" }, T).serialize()).toBe("## Now\n- [ ] p1 A2\n\n## Soon\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A", placement: { kind: "now" }, priority: null }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n");
	});

	it("rename keeps the priority", () => {
		const d = doc("## Now\n- [ ] p2 A\n");
		expect(rename(d, d.tasks("now")[0], "B").serialize()).toBe("## Now\n- [ ] p2 B\n");
	});
});

describe("postpone", () => {
	const TOMORROW = "2026-10-31";

	it("takes a Now task to the end of Soon with the new due date, without its time", () => {
		const d = parse("## Now\n- [ ] A ⏰ 2026-10-30 14:00-15:00\n- [ ] B\n\n## Soon\n- [ ] S\n");
		expect(postpone(d, d.tasks("now")[0], TOMORROW, T).serialize()).toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] S\n- [ ] A 📅 2026-10-31\n");
	});

	it("takes an Inbox task to the end of Soon", () => {
		const d = parse("## Inbox\n- [ ] I\n\n## Now\n\n## Soon\n- [ ] S\n");
		expect(postpone(d, d.tasks("inbox")[0], D, T).serialize()).toBe("## Inbox\n\n## Now\n\n## Soon\n- [ ] S\n- [ ] I 📅 2026-11-03\n");
	});

	it("keeps a Soon task in its place, changing its due date", () => {
		const d = parse("## Now\n\n## Soon\n- [ ] S 📅 2026-10-31\n- [ ] U\n");
		expect(postpone(d, d.tasks("soon")[0], D, T).serialize()).toBe("## Now\n\n## Soon\n- [ ] S 📅 2026-11-03\n- [ ] U\n");
	});

	it("puts a task due today or earlier at the end of Now", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n");
		expect(postpone(d, d.tasks("soon")[0], T, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] S 📅 2026-10-30\n\n## Soon\n");
	});
});

describe("groups", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const SETTINGS = { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" };
	const names = (text: string) => parseG(text).groups("now");

	it("presetPlace", () => {
		expect(presetPlace(names("## Now\n- [ ] A\n### Morning\n- [ ] B\n### Экскурсия\n- [ ] C\n"), "Evening", SETTINGS.presets)).toBe(2);
		expect(presetPlace(names("## Now\n- [ ] A\n### Evening\n- [ ] B\n"), "Morning", SETTINGS.presets)).toBe(1);
		expect(presetPlace(names("## Now\n- [ ] A\n### Экскурсия\n- [ ] C\n"), "Afternoon", SETTINGS.presets)).toBe(2);
	});

	it("moveToGroup from Now into a Soon group drops today's due date", () => {
		const d = parseG("## Now\n- [ ] A 📅 2026-10-30\n\n## Soon\n### X\n- [ ] B\n");
		expect(moveToGroup(d, d.tasks("now")[0], "soon", "X", null, T).serialize()).toBe("## Now\n\n## Soon\n### X\n- [ ] B\n- [ ] A\n");
	});

	it("moveToGroup into Now comes due today, before a task of a group", () => {
		const d = parseG("## Now\n### X\n- [ ] B\n\n## Soon\n- [ ] A\n");
		expect(moveToGroup(d, d.tasks("soon")[0], "now", "X", d.tasks("now")[0], T).serialize()).toBe("## Now\n### X\n- [ ] A 📅 2026-10-30\n- [ ] B\n\n## Soon\n");
	});

	it("moveToGroup into No section at its end", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n");
		expect(moveToGroup(d, d.tasks("now")[1], "now", null, null, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] B 📅 2026-10-30\n### X\n- [ ] C\n");
	});

	it("createGroup puts a preset in order and any other name last", () => {
		const d = parseG("## Now\n- [ ] A\n### Morning\n- [ ] B\n### Экскурсия\n- [ ] C\n\n## Soon\n");
		expect(createGroup(d, d.tasks("now")[0], "now", "Evening", SETTINGS, T).serialize()).toBe(
			"## Now\n### Morning\n- [ ] B\n### Evening\n- [ ] A 📅 2026-10-30\n### Экскурсия\n- [ ] C\n\n## Soon\n",
		);
		expect(createGroup(d, d.tasks("now")[0], "now", "  Вечером дома ", SETTINGS, T).serialize()).toBe(
			"## Now\n### Morning\n- [ ] B\n### Экскурсия\n- [ ] C\n### Вечером дома\n- [ ] A 📅 2026-10-30\n\n## Soon\n",
		);
	});

	it("createGroup with an existing name joins it; with the ungrouped name goes to No section", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n");
		expect(createGroup(d, d.tasks("now")[0], "now", "X", SETTINGS, T).serialize()).toBe("## Now\n### X\n- [ ] B\n- [ ] C\n- [ ] A 📅 2026-10-30\n");
		expect(createGroup(d, d.tasks("now")[1], "now", "No section", SETTINGS, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] B 📅 2026-10-30\n### X\n- [ ] C\n");
	});

	it("renameGroup to an existing name merges; to the ungrouped name empties into No section", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n### Y\n- [ ] C\n");
		expect(normalize(renameGroup(d, "now", "Y", "X", "No section"), T).serialize()).toBe("## Now\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n");
		expect(renameGroup(d, "now", "Y", "No section", "No section").serialize()).toBe("## Now\n- [ ] A\n- [ ] C\n### X\n- [ ] B\n");
		expect(renameGroup(d, "now", "Y", "  ", "No section")).toBe(d);
		expect(renameGroup(d, "now", "Y", "Вечер", "No section").serialize()).toBe("## Now\n- [ ] A\n### X\n- [ ] B\n### Вечер\n- [ ] C\n");
	});

	it("removeGroup keeps the tasks at the end of No section, in order", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n### Y\n- [ ] D\n");
		expect(removeGroup(d, "now", "X").serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n- [ ] C\n### Y\n- [ ] D\n");
	});

	it("moveGroupTo moves a section, and No section below and back", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n### Y\n- [ ] C\n");
		expect(moveGroupTo(d, "now", "Y", { before: "X" }).serialize()).toBe("## Now\n- [ ] A\n### Y\n- [ ] C\n### X\n- [ ] B\n");
		const down = normalize(moveGroupTo(d, "now", null, "end"), T);
		expect(down.serialize()).toBe("## Now\n### X\n- [ ] B\n### Y\n- [ ] C\n### No section\n- [ ] A\n");
		expect(normalize(moveGroupTo(down, "now", null, { before: "X" }), T).serialize()).toBe(d.serialize());
		expect(normalize(moveGroupTo(d, "now", "Y", { before: null }), T).serialize()).toBe("## Now\n### Y\n- [ ] C\n### No section\n- [ ] A\n### X\n- [ ] B\n");
	});

	it("moving the last task out of a group removes the group and, with only No section left, its heading", () => {
		const d = parseG("## Now\n### X\n- [ ] B\n### No section\n- [ ] A\n");
		expect(normalize(moveToGroup(d, d.tasks("now")[0], "now", null, null, T), T).serialize()).toBe("## Now\n- [ ] A\n- [ ] B 📅 2026-10-30\n");
	});

	it("groupIndex finds a section by name, No section always, a missing one never", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n");
		expect(groupIndex(d, "now", "X")).toBe(1);
		expect(groupIndex(d, "now", null)).toBe(0);
		expect(groupIndex(d, "now", "Y")).toBe(-1);
	});
});

describe("groups spaced by blank lines, as written by hand", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const SPACED = "## Now\n- [ ] U\n\n### A\n- [ ] a\n\n### B\n- [ ] b\n\n### C\n- [ ] c\n\n## Soon\n- [ ] S\n";
	const blanks = (text: string) => text.split("\n").filter((l) => l === "").length;

	it("removing sections one by one piles up no blank lines", () => {
		const one = removeGroup(parseG(SPACED), "now", "A");
		expect(one.serialize()).toBe("## Now\n- [ ] U\n- [ ] a\n\n### B\n- [ ] b\n\n### C\n- [ ] c\n\n## Soon\n- [ ] S\n");
		const two = removeGroup(one, "now", "B");
		expect(two.serialize()).toBe("## Now\n- [ ] U\n- [ ] a\n- [ ] b\n\n### C\n- [ ] c\n\n## Soon\n- [ ] S\n");
		const three = renameGroup(two, "now", "C", "No section", "No section");
		expect(three.serialize()).toBe("## Now\n- [ ] U\n- [ ] a\n- [ ] b\n- [ ] c\n\n## Soon\n- [ ] S\n");
	});

	it("moving a section away and back keeps the blank lines", () => {
		const d = parseG(SPACED);
		const back = moveGroupTo(moveGroupTo(d, "now", "A", "end"), "now", "A", { before: "B" });
		expect(blanks(back.serialize())).toBe(blanks(SPACED));
		const lastUp = moveGroupTo(moveGroupTo(d, "now", "C", { before: "A" }), "now", "C", "end");
		expect(blanks(lastUp.serialize())).toBe(blanks(SPACED));
	});

	it("an emptied last section goes with the blank line before it", () => {
		const d = parseG("## Now\n- [ ] U\n\n### A\n- [ ] a 📅 2026-11-03\n\n## Soon\n");
		expect(normalize(d, T).serialize()).toBe("## Now\n- [ ] U\n- [ ] a 📅 2026-11-03\n\n## Soon\n");
	});

	it("a top block of blank lines only: a section put above No section moves alone, no other section dissolves", () => {
		const d = parseG("## Now\n\n### A\n- [ ] a\n- [ ] a2\n\n### B\n- [ ] b\n");
		const moved = normalize(moveGroupTo(d, "now", "B", { before: null }), T);
		expect(moved.groups("now").map((g) => [g.name, g.entries.map((e) => e.task.text)])).toEqual([
			[null, []],
			["B", ["b"]],
			["A", ["a", "a2"]],
		]);
	});
});

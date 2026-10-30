import { describe, expect, it } from "vitest";
import {
	clampSlot,
	clearSlot,
	createAtTime,
	createInList,
	createInSoon,
	moveBefore,
	moveToList,
	moveToSoon,
	newTask,
	placeTask,
	placementOfEntry,
	remove,
	rename,
	setDueDate,
	setSlot,
	setStatus,
} from "../../src/domain/operations";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const D = "2026-11-03";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("newTask", () => {
	it("builds a todo task and applies the patch", () => {
		expect(newTask("A")).toEqual({ status: "todo", statusChar: " ", text: "A", dueDate: null, slot: null, children: [] });
		expect(newTask("A", { dueDate: D }).dueDate).toBe(D);
	});
});

describe("create", () => {
	it("createInList today lands at the end of Now", () => {
		expect(createInList(parse("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n"), T, T, "New").serialize()).toBe("## Now\n- [ ] A\n- [ ] New\n\n## Soon\n- [ ] C\n");
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
	it("puts the task right before the target in the target's section", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveBefore(d, d.tasks("now")[0], d.tasks("soon")[1], T, T).serialize()).toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A\n- [ ] D\n");
		expect(moveBefore(d, d.tasks("now")[1], d.tasks("now")[0], T, T).serialize()).toBe("## Now\n- [ ] B\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D\n");
	});

	it("with no target goes to the end of Now today and the end of Soon on another day", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n");
		expect(moveBefore(d, d.tasks("now")[0], null, T, T).serialize()).toBe("## Now\n- [ ] B\n- [ ] A\n\n## Soon\n- [ ] C\n");
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

	it("setSlot on another day leaves a Soon task where it is", () => {
		const d = parse("## Soon\n- [ ] C\n- [ ] A\n");
		expect(setSlot(d, d.tasks("soon")[0], { date: D, start: 600, end: 660 }, T).serialize()).toBe("## Soon\n- [ ] C ⏰ 2026-11-03 10:00-11:00\n- [ ] A\n");
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

	it("clampSlot keeps a start without a duration inside the day", () => {
		expect(clampSlot({ date: D, start: 1440, end: null }, 30)).toEqual({ date: D, start: 1410, end: null });
		expect(clampSlot({ date: D, start: -10, end: null }, 30)).toEqual({ date: D, start: 0, end: null });
	});

	it("clampSlot keeps the end at midnight and the start a step before", () => {
		expect(clampSlot({ date: D, start: 1420, end: 1480 }, 30)).toEqual({ date: D, start: 1410, end: 1440 });
		expect(clampSlot({ date: D, start: -10, end: 50 }, 30)).toEqual({ date: D, start: 0, end: 60 });
		expect(clampSlot({ date: D, start: 600, end: 660 }, 30)).toEqual({ date: D, start: 600, end: 660 });
	});
});

describe("between the list and Soon", () => {
	it("moveToList today moves to the end of Now", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveToList(d, d.tasks("soon")[0], T, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] C\n\n## Soon\n- [ ] D\n");
	});

	it("moveToList on another day sets the due date and keeps the section", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] C\n- [ ] D\n");
		expect(moveToList(d, d.tasks("soon")[0], D, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] C 📅 2026-11-03\n- [ ] D\n");
	});

	it("moveToSoon today moves to the end of Soon and keeps the due date", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-10-30\n- [ ] B\n\n## Soon\n- [ ] C\n");
		expect(moveToSoon(d, d.tasks("now")[0], T, T).serialize()).toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A 📅 2026-10-30\n");
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
		expect(placeTask(parse(BASE), null, { text: " New ", placement: { kind: "soon" } }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n- [ ] New\n\n## Done\n");
	});

	it("creates at the end of Now", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "now" } }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] New\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("creates with a date today or earlier at the end of Now with the due date", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "date", date: T } }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] New 📅 2026-10-30\n\n## Soon\n- [ ] S\n\n## Done\n");
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "date", date: "2026-10-01" } }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] New 📅 2026-10-01\n\n## Soon\n- [ ] S\n\n## Done\n");
	});

	it("creates with a date after today at the end of Soon with the due date", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "date", date: D } }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n- [ ] New 📅 2026-11-03\n\n## Done\n");
	});

	it("creates with a slot and keeps it", () => {
		expect(placeTask(parse(BASE), null, { text: "New", placement: { kind: "now" } }, T, { date: T, start: 990, end: 1050 }).serialize()).toBe(
			"## Now\n- [ ] A\n- [ ] New ⏰ 2026-10-30 16:30-17:30\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("edits with the same placement in place, text only", () => {
		const d = parse("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A2", placement: { kind: "now" } }, T).serialize()).toBe("## Now\n- [ ] A2 ⏰ 2026-10-30 10:00-11:00\n- [ ] B 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("now")[1], { text: "B2", placement: { kind: "date", date: D } }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B2 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "S2", placement: { kind: "soon" } }, T).serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n- [ ] B 📅 2026-11-03\n  - note\n- [ ] C\n\n## Soon\n- [ ] S2\n");
	});

	it("edits from now to soon: end of Soon, due date dropped, slot and children kept", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-30 10:00-11:00\n  - note\n- [ ] B\n\n## Soon\n- [ ] S\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A2", placement: { kind: "soon" } }, T).serialize()).toBe(
			"## Now\n- [ ] B\n\n## Soon\n- [ ] S\n- [ ] A2 ⏰ 2026-10-30 10:00-11:00\n  - note\n",
		);
	});

	it("edits from soon to a date: due date set, section by the date", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n- [ ] R\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "S", placement: { kind: "date", date: D } }, T).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] S 📅 2026-11-03\n- [ ] R\n");
		expect(placeTask(d, d.tasks("soon")[0], { text: "S", placement: { kind: "date", date: T } }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] S 📅 2026-10-30\n\n## Soon\n- [ ] R\n");
	});

	it("edits from a date to now: due date dropped, position kept", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-10-30\n- [ ] B\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A", placement: { kind: "now" } }, T).serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n");
	});

	it("a changed date within the same section keeps the position", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-10-29\n- [ ] B\n");
		expect(placeTask(d, d.tasks("now")[0], { text: "A", placement: { kind: "date", date: T } }, T).serialize()).toBe("## Now\n- [ ] A 📅 2026-10-30\n- [ ] B\n");
	});
});

describe("placementOf", () => {
	it("returns the date when the task has a due date, else the section", () => {
		const d = parse("## Now\n- [ ] A 📅 2026-11-03\n- [ ] B\n\n## Soon\n- [ ] S\n\n## Done\n- [x] X\n");
		expect(placementOfEntry(d.tasks("now")[0])).toEqual({ kind: "date", date: D });
		expect(placementOfEntry(d.tasks("now")[1])).toEqual({ kind: "now" });
		expect(placementOfEntry(d.tasks("soon")[0])).toEqual({ kind: "soon" });
		expect(placementOfEntry(d.tasks("done")[0])).toEqual({ kind: "now" });
	});
});

describe("placeTask keeps the position when only the date changes within a section", () => {
	it("stays in place in Soon", () => {
		const d = parse("## Now\n\n## Soon\n- [ ] A 📅 2026-11-05\n- [ ] B\n");
		const out = placeTask(d, d.tasks("soon")[0], { text: "A", placement: { kind: "date", date: "2026-11-06" } }, "2026-10-30");
		expect(out.serialize()).toBe("## Now\n\n## Soon\n- [ ] A 📅 2026-11-06\n- [ ] B\n");
	});
});

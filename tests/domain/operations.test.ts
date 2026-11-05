import { describe, expect, it } from "vitest";
import {
	clearSlot,
	createAtTime,
	createGroup,
	createInList,
	groupIndex,
	createInPlace,
	createInSoon,
	createSection,
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
	setReminder,
	setSlot,
	setRepeat,
	setStatus,
	snoozedSlot,
	stop,
} from "../../src/domain/operations";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { normalize } from "../../src/domain/normalize";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const D = "2026-11-03";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("newTask", () => {
	it("builds a todo task and applies the patch", () => {
		expect(newTask("A")).toEqual({ status: "todo", statusChar: " ", text: "A", dueDate: null, slot: null, reminder: "notification", repeat: null, priority: null, children: [] });
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

describe("createInPlace", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const YESTERDAY = "2026-10-29";
	const BASE = "## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] C\n\n## Soon\n- [ ] S\n\n## Done\n";

	it("list now, before a task, puts it right above that task, due today", () => {
		const d = parseG(BASE);
		const place = { kind: "list", list: "now", group: "Evening", before: d.tasks("now")[2], date: null } as const;
		expect(createInPlace(d, "X", null, place, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] X 📅 2026-10-30\n- [ ] C\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("list now, before null, goes last in the group", () => {
		const d = parseG(BASE);
		const place = { kind: "list", list: "now", group: "Evening", before: null, date: null } as const;
		expect(createInPlace(d, "X", null, place, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] C\n- [ ] X 📅 2026-10-30\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("list now, no group, before null, goes to the end of the list", () => {
		const d = parseG("## Now\n- [ ] A\n### Evening\n- [ ] B\n\n## Soon\n");
		const place = { kind: "list", list: "now", group: null, before: null, date: null } as const;
		expect(createInPlace(d, "X", null, place, T, DayBoundary.MIDNIGHT).serialize()).toBe("## Now\n- [ ] A\n- [ ] X 📅 2026-10-30\n### Evening\n- [ ] B\n\n## Soon\n");
	});

	it("list now with a task of another list as before goes to the end of the group", () => {
		const d = parseG(BASE);
		const place = { kind: "list", list: "now", group: "Evening", before: d.tasks("soon")[0], date: null } as const;
		expect(createInPlace(d, "X", null, place, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] C\n- [ ] X 📅 2026-10-30\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("list now on a past day's column is due that day", () => {
		const place = { kind: "list", list: "now", group: null, before: null, date: YESTERDAY } as const;
		expect(createInPlace(parseG(BASE), "X", null, place, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n- [ ] X 📅 2026-10-29\n### Evening\n- [ ] B\n- [ ] C\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("list soon on a later day's column is due that day; without a date it has none", () => {
		const dated = { kind: "list", list: "soon", group: null, before: null, date: "2026-11-02" } as const;
		expect(createInPlace(parseG(BASE), "X", null, dated, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] C\n\n## Soon\n- [ ] S\n- [ ] X 📅 2026-11-02\n\n## Done\n",
		);
		const undated = { kind: "list", list: "soon", group: null, before: null, date: null } as const;
		expect(createInPlace(parseG(BASE), "X", null, undated, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] C\n\n## Soon\n- [ ] S\n- [ ] X\n\n## Done\n",
		);
	});

	it("list inbox goes to the end of Inbox, without a due date or a slot", () => {
		const place = { kind: "list", list: "inbox", group: null, before: null, date: D } as const;
		expect(createInPlace(parseG(BASE), "X", null, place, T, DayBoundary.MIDNIGHT).serialize()).toBe(
			"## Inbox\n- [ ] I\n- [ ] X\n\n## Now\n- [ ] A\n### Evening\n- [ ] B\n- [ ] C\n\n## Soon\n- [ ] S\n\n## Done\n",
		);
	});

	it("a subtask goes before the given subtask or after the last one, without a due date", () => {
		const d = parseG("## Now\n- [ ] P\n  - [ ] S1\n  - [ ] S2\n- [ ] Q\n");
		const parent = d.tasks("now")[0];
		const before = { kind: "subtask", parent, before: parent.subtasks[1] } as const;
		expect(createInPlace(d, "X", null, before, T, DayBoundary.MIDNIGHT).serialize()).toBe("## Now\n- [ ] P\n  - [ ] S1\n  - [ ] X\n  - [ ] S2\n- [ ] Q\n");
		const last = { kind: "subtask", parent, before: null } as const;
		expect(createInPlace(d, "X", null, last, T, DayBoundary.MIDNIGHT).serialize()).toBe("## Now\n- [ ] P\n  - [ ] S1\n  - [ ] S2\n  - [ ] X\n- [ ] Q\n");
	});

	it("a slot gives the same result as createAtTime", () => {
		const slot = { date: T, start: 990, end: null };
		const place = { kind: "slot", slot } as const;
		for (const boundary of [DayBoundary.MIDNIGHT, new DayBoundary(4)]) {
			expect(createInPlace(parseG(BASE), "X", null, place, T, boundary).serialize()).toBe(createAtTime(parseG(BASE), T, T, 990, "X", boundary).serialize());
		}
	});

	it("takes a rule for a task of its own only: a subtask goes with its parent, a task on the calendar has its slot", () => {
		const rule = { kind: "afterDone", every: 1, unit: "week", days: [], dayOfMonth: null, from: null } as const;
		const parseR = (text: string) => TaskDocument.parse(text, G, { ...M, repeat: "🔁" });
		const d = parseR("## Now\n- [ ] P\n\n## Soon\n");
		const sub = createInPlace(d, "X", null, { kind: "subtask", parent: d.tasks("now")[0], before: null }, T, DayBoundary.MIDNIGHT, rule);
		const slot = createInPlace(parseR("## Now\n"), "X", null, { kind: "slot", slot: { date: T, start: 600, end: null } }, T, DayBoundary.MIDNIGHT, rule);
		expect([sub.serialize(), slot.serialize()]).toEqual(["## Now\n- [ ] P\n\t- [ ] X\n\n## Soon\n", "## Now\n- [ ] X ⏰ 2026-10-30 10:00\n"]);
	});

	it("writes the priority before the text", () => {
		const place = { kind: "list", list: "inbox", group: null, before: null, date: null } as const;
		expect(createInPlace(parseG(BASE), "X", "p1", place, T, DayBoundary.MIDNIGHT).serialize()).toContain("- [ ] I\n- [ ] p1 X\n");
		const slot = { kind: "slot", slot: { date: T, start: 600, end: null } } as const;
		expect(createInPlace(parseG("## Now\n"), "X", "p2", slot, T, DayBoundary.MIDNIGHT).serialize()).toBe("## Now\n- [ ] p2 X ⏰ 2026-10-30 10:00\n");
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

describe("Backlog", () => {
	const text = "## Inbox\n- [ ] I\n\n## Backlog\n- [ ] L\n\n## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n- [ ] S\n";

	it("the Backlog tile creates at the end of Backlog and drops a slot", () => {
		const slot = { date: T, start: 600, end: null };
		expect(placeTask(parse(text), null, { text: "New", placement: { kind: "backlog" }, priority: null }, T, slot).serialize()).toBe(
			"## Inbox\n- [ ] I\n\n## Backlog\n- [ ] L\n- [ ] New\n\n## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n- [ ] S\n",
		);
	});

	it("an edit to Backlog takes the due date and the slot away", () => {
		const d = parse(text);
		expect(placeTask(d, d.tasks("now")[0], { text: "A", placement: { kind: "backlog" }, priority: null }, T).serialize()).toBe("## Inbox\n- [ ] I\n\n## Backlog\n- [ ] L\n- [ ] A\n\n## Now\n\n## Soon\n- [ ] S\n");
	});

	it("a Backlog task shows the Backlog tile", () => {
		expect(placementOfEntry(parse(text).tasks("backlog")[0], T)).toEqual({ kind: "backlog" });
	});

	it("moveToEnd moves between Inbox, Backlog and Soon; into Backlog the due date and the slot go", () => {
		const d = parse("## Inbox\n- [ ] I\n\n## Backlog\n- [ ] L\n\n## Soon\n- [ ] S 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00\n");
		expect(moveToEnd(d, d.tasks("inbox")[0], "backlog").serialize()).toBe("## Inbox\n\n## Backlog\n- [ ] L\n- [ ] I\n\n## Soon\n- [ ] S 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00\n");
		expect(moveToEnd(d, d.tasks("soon")[0], "backlog").serialize()).toBe("## Inbox\n- [ ] I\n\n## Backlog\n- [ ] L\n- [ ] S\n\n## Soon\n");
		expect(moveToEnd(d, d.tasks("backlog")[0], "soon").serialize()).toBe("## Inbox\n- [ ] I\n\n## Backlog\n\n## Soon\n- [ ] S 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00\n- [ ] L\n");
		expect(moveToEnd(d, d.tasks("backlog")[0], "inbox").serialize()).toBe("## Inbox\n- [ ] I\n- [ ] L\n\n## Backlog\n\n## Soon\n- [ ] S 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00\n");
	});

	it("a drop into a gap of Backlog puts the task there without a due date", () => {
		const d = parse("## Backlog\n- [ ] L\n- [ ] M\n\n## Now\n- [ ] A 📅 2026-10-30\n");
		expect(moveToGroup(d, d.tasks("now")[0], "backlog", null, d.tasks("backlog")[1], T).serialize()).toBe("## Backlog\n- [ ] L\n- [ ] A\n- [ ] M\n\n## Now\n");
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
		expect(normalize(renameGroup(d, "now", "Y", "X", "No section"), T).serialize()).toBe("## Now\n\n- [ ] A\n### X\n- [ ] B\n- [ ] C\n");
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
		expect(down.serialize()).toBe("## Now\n\n### X\n- [ ] B\n### Y\n- [ ] C\n### No section\n- [ ] A\n");
		expect(normalize(moveGroupTo(down, "now", null, { before: "X" }), T).serialize()).toBe("## Now\n\n- [ ] A\n### X\n- [ ] B\n### Y\n- [ ] C\n");
		expect(normalize(moveGroupTo(d, "now", "Y", { before: null }), T).serialize()).toBe("## Now\n\n### Y\n- [ ] C\n### No section\n- [ ] A\n### X\n- [ ] B\n");
	});

	it("moving the last task out of a group removes the group and, with only No section left, its heading", () => {
		const d = parseG("## Now\n### X\n- [ ] B\n### No section\n- [ ] A\n");
		expect(normalize(moveToGroup(d, d.tasks("now")[0], "now", null, null, T), T).serialize()).toBe("## Now\n\n- [ ] A\n- [ ] B 📅 2026-10-30\n");
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
		expect(normalize(d, T).serialize()).toBe("## Now\n\n- [ ] U\n- [ ] a 📅 2026-11-03\n\n## Soon\n");
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

describe("sections of a later day", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const SETTINGS = { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" };

	it("a drop into a Soon section on a later day's column keeps that day as the due date", () => {
		const d = parseG("## Now\n- [ ] A\n\n## Soon\n### Morning\n- [ ] M 📅 2026-10-31\n");
		expect(moveToGroup(d, d.tasks("now")[0], "soon", "Morning", null, T, "2026-10-31").serialize()).toBe(
			"## Now\n\n## Soon\n### Morning\n- [ ] M 📅 2026-10-31\n- [ ] A 📅 2026-10-31\n",
		);
	});

	it("a zone on a later day's column makes the section in Soon with that day", () => {
		const d = parseG("## Now\n- [ ] A\n\n## Soon\n- [ ] S\n");
		expect(createGroup(d, d.tasks("now")[0], "soon", "Evening", SETTINGS, T, "2026-10-31").serialize()).toBe("## Now\n\n## Soon\n- [ ] S\n### Evening\n- [ ] A 📅 2026-10-31\n");
	});

	it("a gap before a task of another list puts the card at the end of the section", () => {
		const d = parseG("## Now\n- [ ] N 📅 2026-10-31\n- [ ] A\n\n## Soon\n### Morning\n- [ ] M 📅 2026-10-31\n");
		expect(moveToGroup(d, d.tasks("now")[1], "soon", "Morning", d.tasks("now")[0], T, "2026-10-31").serialize()).toBe(
			"## Now\n- [ ] N 📅 2026-10-31\n\n## Soon\n### Morning\n- [ ] M 📅 2026-10-31\n- [ ] A 📅 2026-10-31\n",
		);
	});
});

describe("repeat", () => {
	const R = { ...M, repeat: "🔁" };
	const parseR = (text: string) => TaskDocument.parse(text, SECTIONS, R);
	const TODAY = "2026-11-05";
	const FILE = "## Inbox\n- [ ] Зал\n\n## Now\n- [ ] Отчёт 📅 2026-11-05\n\n## Soon\n- [ ] Врач 📅 2026-11-12\n- [ ] Встреча ⏰ 2026-11-10 09:00\n\n## Done\n";
	const weekly = (days: (0 | 1 | 2 | 3 | 4 | 5 | 6)[], every = 1) => ({ kind: "schedule" as const, every, unit: "week" as const, days, dayOfMonth: null, from: null });
	const afterDone = { kind: "afterDone" as const, every: 3, unit: "week" as const, days: [], dayOfMonth: null, from: null };

	it("setRepeat on an undated Inbox task gives it the first day of the schedule", () => {
		const d = parseR(FILE);
		const set = setRepeat(d, d.tasks("inbox")[0], weekly([3]), TODAY);
		expect(set.tasks("inbox")[0].raw).toBe("- [ ] Зал 📅 2026-11-05 🔁 every week on Thu");
		expect(normalize(set, TODAY).tasks("now").map((e) => e.task.text)).toEqual(["Зал", "Отчёт"]);
	});

	it("setRepeat anchors a schedule of every few weeks at the first day", () => {
		const d = parseR(FILE);
		expect(setRepeat(d, d.tasks("inbox")[0], weekly([4], 2), TODAY).tasks("inbox")[0].raw).toBe("- [ ] Зал 📅 2026-11-06 🔁 every 2 weeks on Fri from 2026-11-06");
	});

	it("setRepeat of every 2 weeks on an undated task takes the nearest suitable day", () => {
		const d = parseR(FILE);
		expect(setRepeat(d, d.tasks("inbox")[0], weekly([0], 2), TODAY).tasks("inbox")[0].raw).toBe("- [ ] Зал 📅 2026-11-09 🔁 every 2 weeks on Mon from 2026-11-09");
	});

	it("setRepeat of every 2 months on an undated task takes the nearest suitable day", () => {
		const d = parseR(FILE);
		const rule = { kind: "schedule" as const, every: 2, unit: "month" as const, days: [], dayOfMonth: 3, from: null };
		expect(setRepeat(d, d.tasks("inbox")[0], rule, TODAY).tasks("inbox")[0].raw).toBe("- [ ] Зал 📅 2026-12-03 🔁 every 2 months on the 3rd from 2026-12-03");
	});

	it("setRepeat afterDone on an undated task gives no date", () => {
		const d = parseR(FILE);
		const set = setRepeat(d, d.tasks("inbox")[0], afterDone, TODAY);
		expect(set.tasks("inbox")[0].raw).toBe("- [ ] Зал 🔁 every 3 weeks when done");
		expect(normalize(set, TODAY).tasks("inbox").map((e) => e.task.text)).toEqual(["Зал"]);
	});

	it("setRepeat on a dated task keeps its date and anchors at it", () => {
		const d = parseR(FILE);
		expect(setRepeat(d, d.tasks("soon")[0], weekly([0], 2), TODAY).tasks("soon")[0].raw).toBe("- [ ] Врач 📅 2026-11-12 🔁 every 2 weeks on Mon from 2026-11-12");
	});

	it("setRepeat on a task with a slot anchors at the slot's day and adds no date", () => {
		const d = parseR(FILE);
		expect(setRepeat(d, d.tasks("soon")[1], weekly([1], 2), TODAY).tasks("soon")[1].raw).toBe("- [ ] Встреча ⏰ 2026-11-10 09:00 🔁 every 2 weeks on Tue from 2026-11-10");
	});

	it("setRepeat replaces the rule", () => {
		const d = parseR("## Soon\n- [ ] Зал 📅 2026-11-06 🔁 every week on Mon, Wed, Fri\n");
		expect(setRepeat(d, d.tasks("soon")[0], afterDone, TODAY).serialize()).toBe("## Soon\n- [ ] Зал 📅 2026-11-06 🔁 every 3 weeks when done\n");
	});

	it("setRepeat null removes the field", () => {
		const d = parseR("## Soon\n- [ ] Зал 📅 2026-11-06 🔁 every week on Mon, Wed, Fri\n");
		expect(setRepeat(d, d.tasks("soon")[0], null, TODAY).serialize()).toBe("## Soon\n- [ ] Зал 📅 2026-11-06\n");
	});

	it("stop closes the task without the field, and no copy follows", () => {
		const d = parseR("## Now\n- [/] Зал 📅 2026-11-05 🔁 every week on Mon, Wed, Fri\n\n## Soon\n\n## Done\n");
		const stopped = stop(d, d.tasks("now")[0]);
		expect(stopped.tasks("now")[0].raw).toBe("- [x] Зал 📅 2026-11-05");
		const normalized = normalize(stopped, TODAY);
		expect(normalized.tasks("soon")).toEqual([]);
		expect(normalized.tasks("done").map((e) => e.raw)).toEqual(["- [x] Зал 📅 2026-11-05"]);
	});
});

describe("reminder kind through operations", () => {
	const R = { dueDate: "📅", slot: "⏰", alarmSlot: "🚨", silentSlot: "🔕" };

	it("keeps the kind through setSlot and setStatus", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A 🚨 2026-10-30 10:00-11:00\n", SECTIONS, R);
		const moved = setSlot(d, d.tasks("now")[0], { date: T, start: 720, end: 780 }, T);
		expect(moved.serialize()).toBe("## Now\n- [ ] A 🚨 2026-10-30 12:00-13:00\n");
		expect(setStatus(moved, moved.tasks("now")[0], "done").serialize()).toContain("- [x] A 🚨 2026-10-30 12:00-13:00");
	});

	it("a task taken off the time and put back gets the default reminder", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A 🔕 2026-10-30 10:00\n", SECTIONS, R);
		const listed = clearSlot(d, d.tasks("now")[0]);
		const back = setSlot(listed, listed.tasks("now")[0], { date: T, start: 900, end: null }, T);
		expect(back.serialize()).toBe("## Now\n- [ ] A ⏰ 2026-10-30 15:00\n");
	});

	it("moving along the time keeps a silenced task silent", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A 🔕 2026-10-30 10:00\n", SECTIONS, R);
		expect(setSlot(d, d.tasks("now")[0], { date: T, start: 900, end: null }, T).serialize()).toBe("## Now\n- [ ] A 🔕 2026-10-30 15:00\n");
	});

	it("setReminder changes the kind and keeps the time", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A 🚨 2026-10-30 10:00\n", SECTIONS, R);
		expect(setReminder(d, d.tasks("now")[0], "none").serialize()).toBe("## Now\n- [ ] A 🔕 2026-10-30 10:00\n");
	});
});


describe("snoozedSlot", () => {
	const now = new Date(2026, 10, 4, 10, 7);

	it("starts the slot the minutes from now and keeps its length", () => {
		expect(snoozedSlot({ date: "2026-11-04", start: 9 * 60, end: 10 * 60 }, now, 30)).toEqual({ date: "2026-11-04", start: 10 * 60 + 37, end: 11 * 60 + 37 });
	});

	it("keeps a slot with no end open", () => {
		expect(snoozedSlot({ date: "2026-11-04", start: 9 * 60, end: null }, now, 15)).toEqual({ date: "2026-11-04", start: 10 * 60 + 22, end: null });
	});

	it("lands on the next day past midnight", () => {
		const late = new Date(2026, 10, 4, 23, 50);
		expect(snoozedSlot({ date: "2026-11-04", start: 23 * 60 + 30, end: 24 * 60 + 30 }, late, 60)).toEqual({ date: "2026-11-05", start: 50, end: 110 });
	});
});

describe("empty sections", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const SETTINGS = { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" };
	const blanks = (text: string) => text.split("\n").filter((l) => l === "").length;

	it("moveToGroup into an empty section puts the task in it; on a later day's column it is Soon with that day", () => {
		const d = parseG("## Now\n\n- [ ] A\n### X\n\n## Soon\n\n- [ ] S\n### Y\n");
		expect(normalize(moveToGroup(d, d.tasks("now")[0], "now", "X", null, T), T).serialize()).toBe("## Now\n\n### X\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n- [ ] S\n### Y\n");
		expect(normalize(moveToGroup(d, d.tasks("now")[0], "soon", "Y", null, T, "2026-10-31"), T).serialize()).toBe("## Now\n\n### X\n\n## Soon\n\n- [ ] S\n### Y\n- [ ] A 📅 2026-10-31\n");
	});

	it("createGroup from the only task of a section takes the section away and makes the new one", () => {
		const d = parseG("## Now\n\n- [ ] A\n### X\n- [ ] B\n");
		expect(normalize(createGroup(d, d.tasks("now")[1], "now", "Y", SETTINGS, T), T).serialize()).toBe("## Now\n\n- [ ] A\n### Y\n- [ ] B 📅 2026-10-30\n");
	});

	it("an empty section is renamed and removed as any", () => {
		const d = parseG("## Now\n\n- [ ] A\n### X\n### Y\n- [ ] B\n");
		expect(normalize(renameGroup(d, "now", "X", "Вечер", "No section"), T).serialize()).toBe("## Now\n\n- [ ] A\n### Вечер\n### Y\n- [ ] B\n");
		expect(normalize(removeGroup(d, "now", "X"), T).serialize()).toBe("## Now\n\n- [ ] A\n### Y\n- [ ] B\n");
	});

	describe("moving an empty section", () => {
		const FILE = "## Now\n\n- [ ] U\n### A\n- [ ] a\n### E\n### B\n- [ ] b\n\n## Soon\n\n- [ ] S\n";
		const moved = (text: string, group: string, place: Parameters<typeof moveGroupTo>[3]) => {
			const once = normalize(moveGroupTo(parseG(text), "now", group, place), T);
			expect(normalize(once, T).serialize()).toBe(once.serialize());
			return once.serialize();
		};

		it("into the middle and to the end of the list", () => {
			expect(moved(FILE, "E", { before: "A" })).toBe("## Now\n\n- [ ] U\n### E\n### A\n- [ ] a\n### B\n- [ ] b\n\n## Soon\n\n- [ ] S\n");
			expect(moved(FILE, "E", "end")).toBe("## Now\n\n- [ ] U\n### A\n- [ ] a\n### B\n- [ ] b\n### E\n\n## Soon\n\n- [ ] S\n");
		});

		it("to the end of the last list of the file", () => {
			const last = "## Soon\n\n- [ ] S\n### E\n### B\n- [ ] b\n";
			const once = normalize(moveGroupTo(parseG(last), "soon", "E", "end"), T);
			expect(once.serialize()).toBe("## Soon\n\n- [ ] S\n### B\n- [ ] b\n### E\n");
		});

		it("above No section: its tasks go under the No section heading; without them no heading is written", () => {
			expect(moved(FILE, "E", { before: null })).toBe("## Now\n\n### E\n### No section\n- [ ] U\n### A\n- [ ] a\n### B\n- [ ] b\n\n## Soon\n\n- [ ] S\n");
			expect(moved("## Now\n\n### A\n- [ ] a\n### E\n\n## Soon\n", "E", { before: null })).toBe("## Now\n\n### E\n### A\n- [ ] a\n\n## Soon\n");
		});

		it("two empty sections side by side both stay", () => {
			const two = "## Now\n\n- [ ] U\n### A\n- [ ] a\n### E\n### F\n\n## Soon\n";
			expect(moved(two, "F", { before: "A" })).toBe("## Now\n\n- [ ] U\n### F\n### A\n- [ ] a\n### E\n\n## Soon\n");
			expect(moved(two, "E", "end")).toBe("## Now\n\n- [ ] U\n### A\n- [ ] a\n### F\n### E\n\n## Soon\n");
		});

		it("the blank lines stay as with a section that has tasks, at either end of the list", () => {
			const spaced = "## Now\n\n- [ ] U\n\n### A\n- [ ] a\n\n### E\n\n### B\n- [ ] b\n\n## Soon\n\n- [ ] S\n";
			const first = moved(spaced, "E", { before: null });
			expect(first.startsWith("## Now\n\n### E\n")).toBe(true);
			expect(blanks(first)).toBe(blanks(spaced));
			const last = moved(spaced, "E", "end");
			expect(last.endsWith("### E\n\n## Soon\n\n- [ ] S\n")).toBe(true);
			expect(blanks(last)).toBe(blanks(spaced));
			expect(parseG(last).groups("now").map((g) => g.name)).toEqual([null, "A", "B", "E"]);
		});
	});
});

describe("createSection", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const SETTINGS = { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" };
	const B = DayBoundary.MIDNIGHT;
	const LATER = "2026-10-31";
	const TODAY = { kind: "day", date: T } as const;
	const named = (d: TaskDocument, text: string) => d.allTasks().find((e) => e.task.text === text)!;
	const section = (text: string, group: string | null, before: string | null, name: string, column: Parameters<typeof createSection>[1] = TODAY) => {
		const d = parseG(text);
		return normalize(createSection(d, column, group, before === null ? null : named(d, before), name, SETTINGS, T, B), T).serialize();
	};

	it("the middle of a group: the tasks below go into the new section right after the group", () => {
		expect(section("## Now\n\n- [ ] U\n### A\n- [ ] a1\n- [ ] a2\n- [ ] a3\n### B\n- [ ] b\n", "A", "a2", " Z ")).toBe(
			"## Now\n\n- [ ] U\n### A\n- [ ] a1\n### Z\n- [ ] a2\n- [ ] a3\n### B\n- [ ] b\n",
		);
	});

	it("above the first task of a section: the section stays empty", () => {
		expect(section("## Now\n\n- [ ] U\n### A\n- [ ] a1\n- [ ] a2\n", "A", "a1", "Z")).toBe("## Now\n\n- [ ] U\n### A\n### Z\n- [ ] a1\n- [ ] a2\n");
	});

	it("the end of a group writes an empty section; the end of the last group, at the end of the list", () => {
		expect(section("## Now\n\n- [ ] U\n### A\n- [ ] a\n### B\n- [ ] b\n\n## Soon\n", "A", null, "Z")).toBe("## Now\n\n- [ ] U\n### A\n- [ ] a\n### Z\n### B\n- [ ] b\n\n## Soon\n");
		expect(section("## Now\n\n- [ ] U\n### A\n- [ ] a\n\n## Soon\n", "A", null, "Z")).toBe("## Now\n\n- [ ] U\n### A\n- [ ] a\n### Z\n\n## Soon\n");
	});

	it("the middle of No section on top: the new section is the first heading", () => {
		expect(section("## Now\n\n- [ ] U1\n- [ ] U2\n### A\n- [ ] a\n", null, "U2", "Z")).toBe("## Now\n\n- [ ] U1\n### Z\n- [ ] U2\n### A\n- [ ] a\n");
		expect(section("## Now\n\n- [ ] U1\n- [ ] U2\n", null, "U1", "Z")).toBe("## Now\n\n### Z\n- [ ] U1\n- [ ] U2\n");
	});

	it("subtasks go with their tasks; a preset name stands where the field is", () => {
		expect(section("## Now\n\n- [ ] U\n### Evening\n- [ ] e1\n- [ ] e2\n  - [ ] sub\n", "Evening", "e2", "Morning")).toBe(
			"## Now\n\n- [ ] U\n### Evening\n- [ ] e1\n### Morning\n- [ ] e2\n  - [ ] sub\n",
		);
	});

	it("a blank name, the No section name and the group's own name leave the document as it is", () => {
		const d = parseG("## Now\n\n- [ ] U\n### A\n- [ ] a\n");
		for (const name of ["  ", "No section", "A"]) expect(createSection(d, TODAY, "A", d.tasks("now")[1], name, SETTINGS, T, B)).toBe(d);
	});

	it("the name of a section the list has, above or below the line: the tasks below go to its end, no section moves", () => {
		const text = "## Now\n\n### H\n- [ ] h\n### A\n- [ ] a1\n- [ ] a2\n### K\n- [ ] k\n";
		expect(section(text, "A", "a2", "H")).toBe("## Now\n\n### H\n- [ ] h\n- [ ] a2\n### A\n- [ ] a1\n### K\n- [ ] k\n");
		expect(section(text, "A", "a1", "K")).toBe("## Now\n\n### H\n- [ ] h\n### A\n### K\n- [ ] k\n- [ ] a1\n- [ ] a2\n");
	});

	it("a later day: the Soon tasks it hides stay in the group, in place; Soon's column keeps its order", () => {
		const text = "## Now\n\n## Soon\n\n### A\n- [ ] a1 📅 2026-10-31\n- [ ] free\n- [ ] a2 📅 2026-10-31\n- [ ] other 📅 2026-11-03\n- [ ] a3 📅 2026-10-31\n### B\n- [ ] b\n";
		expect(section(text, "A", "a2", "Z", { kind: "day", date: LATER })).toBe(
			"## Now\n\n## Soon\n\n### A\n- [ ] a1 📅 2026-10-31\n- [ ] free\n- [ ] other 📅 2026-11-03\n### Z\n- [ ] a2 📅 2026-10-31\n- [ ] a3 📅 2026-10-31\n### B\n- [ ] b\n",
		);
	});

	it("in Soon's column only the tasks without a date go", () => {
		const text = "## Soon\n\n- [ ] s1\n- [ ] s2\n- [ ] d 📅 2026-10-31\n- [ ] s3\n";
		expect(section(text, null, "s2", "Z", { kind: "soon" })).toBe("## Soon\n\n- [ ] s1\n- [ ] d 📅 2026-10-31\n### Z\n- [ ] s2\n- [ ] s3\n");
	});

	it("a later day: Now's tasks of that day below the line enter the new Soon section first, with the day", () => {
		const text = "## Now\n\n- [ ] keep\n- [ ] n1 📅 2026-10-31\n- [ ] n2 📅 2026-10-31\n\n## Soon\n\n- [ ] s 📅 2026-10-31\n";
		expect(section(text, null, "n2", "Z", { kind: "day", date: LATER })).toBe(
			"## Now\n\n- [ ] keep\n- [ ] n1 📅 2026-10-31\n\n## Soon\n\n### Z\n- [ ] n2 📅 2026-10-31\n- [ ] s 📅 2026-10-31\n",
		);
		expect(section("## Now\n\n- [ ] n 📅 2026-10-31\n\n## Soon\n\n- [ ] free\n", null, "n", "Z", { kind: "day", date: LATER })).toBe(
			"## Now\n\n## Soon\n\n- [ ] free\n### Z\n- [ ] n 📅 2026-10-31\n",
		);
	});

	it("Inbox: a section from the field in its column", () => {
		expect(section("## Inbox\n\n- [ ] i1\n- [ ] i2\n", null, "i2", "Z", { kind: "inbox" })).toBe("## Inbox\n\n- [ ] i1\n### Z\n- [ ] i2\n");
	});
});

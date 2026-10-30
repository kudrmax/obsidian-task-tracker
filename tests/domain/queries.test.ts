import { describe, expect, it } from "vitest";
import { inboxList, listOn, openSlotted, slottedOn, soonList, toItem } from "../../src/domain/queries";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";
const D = "2026-11-03";

const TEXT = [
	"## Now",
	"- [ ] Plain",
	"- [/] Slotted today ⏰ 2026-10-30 10:00-11:00",
	"- [ ] Slotted tomorrow ⏰ 2026-10-31 10:00-11:00",
	"- [ ] Due D 📅 2026-11-03",
	"- [ ] Due D slotted D 📅 2026-11-03 ⏰ 2026-11-03 09:00-10:00",
	"",
	"## Soon",
	"- [ ] Soon plain",
	"- [ ] Soon due today 📅 2026-10-30",
	"- [ ] Soon due D 📅 2026-11-03",
	"- [ ] Soon slotted D ⏰ 2026-11-03 12:00-13:00",
	"- [ ] Soon due D slotted today 📅 2026-11-03 ⏰ 2026-10-30 12:00-13:00",
	"",
	"## Done",
	"- [x] Done due D 📅 2026-11-03",
	"",
].join("\n");

const doc = TaskDocument.parse(TEXT, SECTIONS, M);
const texts = (entries: readonly { task: { text: string } }[]) => entries.map((e) => e.task.text);

describe("listOn", () => {
	it("today: Now without a slot on today, then Soon due today", () => {
		expect(texts(listOn(doc, T, T))).toEqual(["Plain", "Slotted tomorrow", "Due D", "Due D slotted D", "Soon due today"]);
	});

	it("another day: Now and Soon due that day without a slot on it", () => {
		expect(texts(listOn(doc, D, T))).toEqual(["Due D", "Soon due D", "Soon due D slotted today"]);
	});

	it("a day with nothing due is empty", () => {
		expect(listOn(doc, "2026-12-01", T)).toEqual([]);
	});
});

describe("slottedOn", () => {
	it("lists Now and Soon tasks slotted on the date, in file order", () => {
		expect(texts(slottedOn(doc, T))).toEqual(["Slotted today", "Soon due D slotted today"]);
		expect(texts(slottedOn(doc, "2026-10-31"))).toEqual(["Slotted tomorrow"]);
		expect(texts(slottedOn(doc, D))).toEqual(["Due D slotted D", "Soon slotted D"]);
	});
});

describe("openSlotted", () => {
	it("every unfinished task with a slot in Now and Soon, whatever the day", () => {
		expect(texts(openSlotted(doc))).toEqual(["Slotted today", "Slotted tomorrow", "Due D slotted D", "Soon slotted D", "Soon due D slotted today"]);
	});

	it("skips a finished one still waiting for the rules to move it to Done", () => {
		const finished = TaskDocument.parse(["## Now", "- [x] Done ⏰ 2026-10-30 10:00", "- [-] Cancelled ⏰ 2026-10-30 11:00", "- [ ] Open ⏰ 2026-10-30 12:00"].join("\n"), SECTIONS, M);
		expect(texts(openSlotted(finished))).toEqual(["Open"]);
	});
});

describe("soonList", () => {
	it("lists Soon tasks without a due date and without a slot", () => {
		expect(texts(soonList(doc))).toEqual(["Soon plain"]);
	});
});

describe("toItem", () => {
	it("carries the key and the fields the UI shows", () => {
		expect(toItem(doc.tasks("now")[1])).toEqual({
			key: { section: "now", index: 1, raw: "- [/] Slotted today ⏰ 2026-10-30 10:00-11:00" },
			text: "Slotted today",
			status: "inProgress",
			dueDate: null,
			slot: { date: T, start: 600, end: 660 },
			priority: null,
		});
	});
});

describe("a day that starts at 4", () => {
	const night = TaskDocument.parse("## Now\n- [ ] Late ⏰ 2026-10-31 01:00-02:00\n- [ ] Early ⏰ 2026-10-30 02:00-03:00\n- [ ] Plain\n", SECTIONS, M);
	const atFour = new DayBoundary(4);

	it("the timeline takes the slots from 4 to 4", () => {
		expect(texts(slottedOn(night, T, atFour))).toEqual(["Late"]);
		expect(texts(slottedOn(night, "2026-10-29", atFour))).toEqual(["Early"]);
	});

	it("the list leaves out what the timeline shows", () => {
		expect(texts(listOn(night, T, T, atFour))).toEqual(["Early", "Plain"]);
	});
});

describe("inboxList", () => {
	const withInbox = TaskDocument.parse("## Inbox\n- [ ] I\n- [/] J\n\n## Now\n- [ ] N\n\n## Soon\n- [ ] S\n", SECTIONS, M);

	it("lists every Inbox task in file order", () => {
		expect(texts(inboxList(withInbox))).toEqual(["I", "J"]);
	});

	it("keeps Inbox out of the day's list, Soon and the timeline", () => {
		expect(texts(listOn(withInbox, T, T))).toEqual(["N"]);
		expect(texts(soonList(withInbox))).toEqual(["S"]);
	});
});

describe("toItem with priority levels", () => {
	const RED = { prefix: "p1", color: "red" } as const;
	const levelOf = (prefix: string) => (prefix === "p1" ? RED : null);

	it("gives the level of the task's prefix, none without one", () => {
		const d = TaskDocument.parse("## Now\n- [ ] p1 A\n- [ ] B\n", SECTIONS, { ...M, priorities: ["p1"] });
		expect(toItem(d.tasks("now")[0], levelOf)).toMatchObject({ text: "A", priority: RED });
		expect(toItem(d.tasks("now")[1], levelOf).priority).toBeNull();
	});
});

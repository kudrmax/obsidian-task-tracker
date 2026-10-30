import { describe, expect, it } from "vitest";
import { listOn, slottedOn, soonList, toItem } from "../../src/domain/queries";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { now: "Now", soon: "Soon", done: "Done" };
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

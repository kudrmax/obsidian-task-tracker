import { describe, expect, it } from "vitest";
import { columnGroups, inboxList, dayList, openSlotted, repeatable, slottedOn, soonWithoutDate } from "../../src/domain/queries";
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

describe("dayList", () => {
	it("today: Now without a slot on today, then Soon due today", () => {
		expect(texts(dayList(doc, T, T))).toEqual(["Plain", "Slotted tomorrow", "Due D", "Due D slotted D", "Soon due today"]);
	});

	it("another day: Now and Soon due that day without a slot on it", () => {
		expect(texts(dayList(doc, D, T))).toEqual(["Due D", "Soon due D", "Soon due D slotted today"]);
	});

	it("a day with nothing due is empty", () => {
		expect(dayList(doc, "2026-12-01", T)).toEqual([]);
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

describe("soonWithoutDate", () => {
	it("lists Soon tasks without a due date and without a slot", () => {
		expect(texts(soonWithoutDate(doc))).toEqual(["Soon plain"]);
	});
});

describe("repeatable", () => {
	it("is an open task of its own; not a subtask, nor a closed task", () => {
		const d = TaskDocument.parse("## Now\n- [ ] A\n\t- [ ] A1\n- [x] B\n- [-] C\n- [/] D\n", SECTIONS, M);
		const [a, b, c, dd] = d.tasks("now");
		expect([a, a.subtasks[0], b, c, dd].map(repeatable)).toEqual([true, false, false, false, true]);
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
		expect(texts(dayList(night, T, T, atFour))).toEqual(["Early", "Plain"]);
	});
});

describe("inboxList", () => {
	const withInbox = TaskDocument.parse("## Inbox\n- [ ] I\n- [/] J\n\n## Now\n- [ ] N\n\n## Soon\n- [ ] S\n", SECTIONS, M);

	it("lists every Inbox task in file order", () => {
		expect(texts(inboxList(withInbox))).toEqual(["I", "J"]);
	});

	it("keeps Inbox out of the day's list, Soon and the timeline", () => {
		expect(texts(dayList(withInbox, T, T))).toEqual(["N"]);
		expect(texts(soonWithoutDate(withInbox))).toEqual(["S"]);
	});
});

describe("columnGroups", () => {
	const G = { ...SECTIONS, backlog: "Backlog", ungrouped: "No section" };
	const FILE = [
		"## Inbox",
		"- [ ] I",
		"### Пусто",
		"",
		"## Now",
		"- [ ] N",
		"### Вечер",
		"- [ ] E",
		"### Пустая",
		"### Текст",
		"note",
		"",
		"## Soon",
		"- [ ] free",
		"- [ ] n 📅 2026-10-31",
		"### Завтра",
		"- [ ] t 📅 2026-10-31",
		"### Другой день",
		"- [ ] x 📅 2026-11-03",
		"### Пустая Soon",
		"",
	].join("\n");
	const d = TaskDocument.parse(FILE, G, M);
	const shape = (column: Parameters<typeof columnGroups>[1]) => columnGroups(d, column, T).map((g) => [g.list, g.index, g.name, texts(g.entries)]);

	it("an empty section shows in its list's column, one with only text too", () => {
		expect(shape({ kind: "inbox" })).toEqual([["inbox", 0, null, ["I"]], ["inbox", 1, "Пусто", []]]);
		expect(shape({ kind: "day", date: T })).toEqual([
			["now", 0, null, ["N"]],
			["now", 1, "Вечер", ["E"]],
			["now", 2, "Пустая", []],
			["now", 3, "Текст", []],
		]);
	});

	it("an empty Soon section shows in Soon and on every later day; one with tasks for another day does not", () => {
		expect(shape({ kind: "soon" })).toEqual([["soon", 0, null, ["free"]], ["soon", 3, "Пустая Soon", []]]);
		expect(shape({ kind: "day", date: "2026-10-31" })).toEqual([["soon", 0, null, ["n"]], ["soon", 1, "Завтра", ["t"]], ["soon", 3, "Пустая Soon", []]]);
		expect(shape({ kind: "day", date: "2026-12-01" })).toEqual([["soon", 3, "Пустая Soon", []]]);
	});

	it("a later day's No section shows Now's tasks of that day above Soon's", () => {
		const later = TaskDocument.parse("## Now\n- [ ] keep\n- [ ] a 📅 2026-10-31\n\n## Soon\n- [ ] b 📅 2026-10-31\n", G, M);
		expect(columnGroups(later, { kind: "day", date: "2026-10-31" }, T).map((g) => [g.name, texts(g.entries)])).toEqual([[null, ["a", "b"]]]);
	});

	it("No section without tasks is not shown; a past day shows no groups", () => {
		const bare = TaskDocument.parse("## Now\n### X\n- [ ] A\n", G, M);
		expect(columnGroups(bare, { kind: "day", date: T }, T).map((g) => g.name)).toEqual(["X"]);
		expect(columnGroups(d, { kind: "day", date: "2026-10-29" }, T)).toEqual([]);
	});
});

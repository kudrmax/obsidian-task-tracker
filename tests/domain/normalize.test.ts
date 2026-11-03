import { afterEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../../src/domain/normalize";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { TaskDocument } from "../../src/domain/TaskDocument";

const AT_FOUR = new DayBoundary(4);

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("rule 1: past slots", () => {
	it("erases a past slot and keeps the due date", () => {
		expect(normalize(parse("## Now\n\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-29 10:00-11:00\n"), T).serialize()).toBe("## Now\n\n- [ ] A 📅 2026-11-03\n");
	});

	it("leaves today's and future slots", () => {
		const text = "## Now\n\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n\n- [/] B ⏰ 2026-11-01 10:00-11:00\n\n## Done\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("does not touch done tasks", () => {
		const text = "## Done\n\n- [x] A ⏰ 2026-10-29 10:00-11:00\n- [-] B ⏰ 2026-10-29 10:00-11:00\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("erases past slots in Soon and in-progress tasks too", () => {
		expect(normalize(parse("## Soon\n\n- [/] A ⏰ 2026-10-29 10:00-11:00\n- [ ] B ⏰ 2026-10-01 10:00-11:00\n"), T).serialize()).toBe(
			"## Soon\n\n- [/] A 📅 2026-10-30\n- [ ] B 📅 2026-10-30\n",
		);
	});

	it("erases a second past slot the first one hid in the task's text", () => {
		expect(normalize(parse("## Now\n\n- [ ] A ⏰ 2020-01-01 10:00 ⏰ 2020-01-02 10:00\n"), T).serialize()).toBe("## Now\n\n- [ ] A 📅 2026-10-30\n");
	});

	it("gives a task left without a date the slot's day, which turns into today", () => {
		expect(normalize(parse("## Now\n\n- [ ] A ⏰ 2026-10-29 10:00-11:00\n"), T).serialize()).toBe("## Now\n\n- [ ] A 📅 2026-10-30\n");
	});
});

describe("past due dates", () => {
	it("an open task's past due date becomes today's", () => {
		expect(normalize(parse("## Now\n\n- [ ] A 📅 2026-10-28\n- [/] B 📅 2026-10-01\n- [ ] C 📅 2026-11-01\n- [ ] D\n"), T).serialize()).toBe(
			"## Now\n\n- [ ] A 📅 2026-10-30\n- [/] B 📅 2026-10-30\n- [ ] C 📅 2026-11-01\n- [ ] D\n",
		);
	});

	it("a closed task keeps its date", () => {
		const text = "## Done\n\n- [x] A 📅 2026-10-28\n- [-] B 📅 2026-10-28\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("rule 2: done and cancelled", () => {
	it("moves done and cancelled to the start of Done, keeping their order", () => {
		expect(normalize(parse("## Now\n\n- [x] A\n- [ ] B\n- [-] C\n\n## Done\n\n- [x] Old\n"), T).serialize()).toBe("## Now\n\n- [ ] B\n\n## Done\n\n- [x] A\n- [-] C\n- [x] Old\n");
	});

	it("takes them from Soon with their children", () => {
		expect(normalize(parse("## Now\n\n- [x] A\n\n## Soon\n\n- [x] S\n  - note\n- [ ] T\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n\n- [ ] T\n\n## Done\n\n- [x] A\n- [x] S\n  - note\n");
	});

	it("skips the rule when there is no Done section", () => {
		const text = "## Now\n\n- [x] A\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("rule 4: Soon tasks due today or earlier", () => {
	it("moves a Soon task due today or earlier to the start of Now", () => {
		expect(normalize(parse("## Now\n\n- [ ] N\n\n## Soon\n\n- [ ] S 📅 2026-10-30\n- [ ] Later 📅 2026-11-01\n"), T).serialize()).toBe(
			"## Now\n\n- [ ] S 📅 2026-10-30\n- [ ] N\n\n## Soon\n\n- [ ] Later 📅 2026-11-01\n",
		);
	});

	it("moves overdue tasks in file order, keeping it", () => {
		expect(normalize(parse("## Now\n\n- [ ] N\n\n## Soon\n\n- [ ] A 📅 2026-10-01\n- [ ] X\n- [/] B 📅 2026-10-29\n"), T).serialize()).toBe(
			"## Now\n\n- [ ] A 📅 2026-10-30\n- [/] B 📅 2026-10-30\n- [ ] N\n\n## Soon\n\n- [ ] X\n",
		);
	});

	it("also fires on a slot dated today", () => {
		expect(normalize(parse("## Now\n\n## Soon\n\n- [ ] S ⏰ 2026-10-30 10:00-11:00\n"), T).serialize()).toBe("## Now\n\n- [ ] S ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n\n");
	});

	it("does not move a done Soon task to Now", () => {
		expect(normalize(parse("## Now\n\n## Soon\n\n- [x] S 📅 2026-10-30\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n\n## Done\n\n- [x] S 📅 2026-10-30\n");
	});

	it("skips the rule when there is no Now section", () => {
		const text = "## Soon\n\n- [ ] S 📅 2026-10-30\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("as a whole", () => {
	const messy = "## Now\n\n- [ ] A ⏰ 2026-10-29 10:00-11:00\n- [x] B\n\n## Soon\n\n- [ ] C 📅 2026-10-29 ⏰ 2026-10-28 09:00-10:00\n- [-] D\n- [ ] E\n\n## Done\n\n- [x] Old\n";

	it("applies the rules in order with one result", () => {
		expect(normalize(parse(messy), T).serialize()).toBe("## Now\n\n- [ ] C 📅 2026-10-30\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n- [ ] E\n\n## Done\n\n- [x] B\n- [-] D\n- [x] Old\n");
	});

	it("is idempotent", () => {
		const once = normalize(parse(messy), T);
		expect(normalize(once, T)).toBe(once);
	});

	it("returns the same object when nothing changes", () => {
		const clean = parse("## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] B 📅 2026-11-01\n\n## Done\n\n- [x] C\n");
		expect(normalize(clean, T)).toBe(clean);
	});
});

describe("a day that starts at 4", () => {
	it("erases a slot before 4 today: it belonged to the day before", () => {
		const text = "## Now\n\n- [ ] A ⏰ 2026-10-30 02:00-03:00\n";
		expect(normalize(parse(text), T, AT_FOUR).serialize()).toBe("## Now\n\n- [ ] A 📅 2026-10-30\n");
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("keeps a slot after midnight of today and brings its Soon task to Now", () => {
		expect(normalize(parse("## Now\n\n## Soon\n\n- [ ] S ⏰ 2026-10-31 01:00-02:00\n"), T, AT_FOUR).serialize()).toBe("## Now\n\n- [ ] S ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n\n");
	});
});

describe("rule 3 for Backlog: a Backlog task that got its day leaves Backlog", () => {
	it("a due date in the future sends it to the end of Soon, today's to Now", () => {
		expect(normalize(parse("## Backlog\n\n- [ ] A 📅 2026-11-03\n- [ ] B\n- [ ] C 📅 2026-10-30\n\n## Now\n\n## Soon\n\n- [ ] S\n"), T).serialize()).toBe(
			"## Backlog\n\n- [ ] B\n\n## Now\n\n- [ ] C 📅 2026-10-30\n\n## Soon\n\n- [ ] S\n- [ ] A 📅 2026-11-03\n",
		);
	});

	it("a done Backlog task goes to Done", () => {
		expect(normalize(parse("## Backlog\n\n- [x] A\n\n## Done\n"), T).serialize()).toBe("## Backlog\n\n## Done\n\n- [x] A\n");
	});

	it("keeps its sections, and drops an empty one", () => {
		expect(normalize(parse("## Backlog\n\n- [ ] A\n### Дом\n- [ ] B\n### Пусто\n\n## Done\n"), T).serialize()).toBe("## Backlog\n\n- [ ] A\n### Дом\n- [ ] B\n\n## Done\n");
	});
});

describe("rule 3: a sorted Inbox task leaves Inbox", () => {
	it("a due date in the future sends it to the end of Soon", () => {
		expect(normalize(parse("## Inbox\n\n- [ ] A 📅 2026-11-03\n- [ ] B\n\n## Now\n\n## Soon\n\n- [ ] S\n"), T).serialize()).toBe("## Inbox\n\n- [ ] B\n\n## Now\n\n## Soon\n\n- [ ] S\n- [ ] A 📅 2026-11-03\n");
	});

	it("a due date today or a slot today ends in Now", () => {
		expect(normalize(parse("## Inbox\n\n- [ ] A 📅 2026-10-30\n- [/] B ⏰ 2026-10-30 10:00-11:00\n\n## Now\n\n- [ ] N\n\n## Soon\n"), T).serialize()).toBe("## Inbox\n\n## Now\n\n- [ ] A 📅 2026-10-30\n- [/] B ⏰ 2026-10-30 10:00-11:00\n- [ ] N\n\n## Soon\n");
	});

	it("a task without fields stays; one whose past slot was erased keeps today's date and leaves", () => {
		expect(normalize(parse("## Inbox\n\n- [ ] A\n- [ ] B ⏰ 2026-10-29 10:00-11:00\n\n## Soon\n"), T).serialize()).toBe("## Inbox\n\n- [ ] A\n\n## Soon\n\n- [ ] B 📅 2026-10-30\n");
	});

	it("a done or cancelled Inbox task goes to Done", () => {
		expect(normalize(parse("## Inbox\n\n- [x] A\n- [ ] B\n- [-] C\n\n## Done\n\n- [x] Old\n"), T).serialize()).toBe("## Inbox\n\n- [ ] B\n\n## Done\n\n- [x] A\n- [-] C\n- [x] Old\n");
	});

	it("waits while the file has no Soon", () => {
		const text = "## Inbox\n\n- [ ] A 📅 2026-11-03\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("sections: rules 5-8", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const run = (text: string) => normalize(TaskDocument.parse(text, G, M), T).serialize();

	it("rule 5: a slotted task leaves its group, and the empty group goes (rule 8)", () => {
		expect(run("## Now\n\n- [ ] A\n### Вечер\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### X\n- [ ] C\n")).toBe("## Now\n\n- [ ] A\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### X\n- [ ] C\n");
	});

	it("rule 5: a Now task due tomorrow leaves its group", () => {
		expect(run("## Now\n\n- [ ] A\n### X\n- [ ] B 📅 2026-10-31\n- [ ] C\n")).toBe("## Now\n\n- [ ] A\n- [ ] B 📅 2026-10-31\n### X\n- [ ] C\n");
	});

	it("rule 5: a Soon task with a due date keeps its group, a slotted one leaves it", () => {
		const dated = "## Soon\n\n### X\n- [ ] B 📅 2026-11-03\n- [ ] C\n";
		expect(run(dated)).toBe(dated);
		expect(run("## Soon\n\n### X\n- [ ] B ⏰ 2026-11-03 10:00-11:00\n- [ ] C\n")).toBe("## Soon\n\n- [ ] B ⏰ 2026-11-03 10:00-11:00\n### X\n- [ ] C\n");
	});

	it("rule 4 takes a Soon task whose day came into Now's section of the same name", () => {
		expect(run("## Now\n\n- [ ] N\n### Morning\n- [ ] M\n\n## Soon\n\n### Morning\n- [ ] A 📅 2026-10-30\n- [ ] Later 📅 2026-11-03\n")).toBe(
			"## Now\n\n- [ ] N\n### Morning\n- [ ] M\n- [ ] A 📅 2026-10-30\n\n## Soon\n\n### Morning\n- [ ] Later 📅 2026-11-03\n",
		);
	});

	it("rule 4 makes the section in Now when it is missing, a preset in the presets' order", () => {
		const doc = TaskDocument.parse("## Now\n\n- [ ] N\n### Evening\n- [ ] E\n\n## Soon\n\n### Morning\n- [ ] A 📅 2026-10-30\n### Trip\n- [ ] B 📅 2026-10-30\n", G, M);
		expect(normalize(doc, T, undefined, ["Morning", "Afternoon", "Evening"]).serialize()).toBe(
			"## Now\n\n- [ ] N\n### Morning\n- [ ] A 📅 2026-10-30\n### Evening\n- [ ] E\n### Trip\n- [ ] B 📅 2026-10-30\n\n## Soon\n",
		);
	});

	it("rule 5: an Inbox group keeps any task", () => {
		const text = "## Inbox\n\n### X\n- [ ] B\n";
		expect(run(text)).toBe(text);
	});

	it("rule 6: duplicates merge into the first, in order", () => {
		expect(run("## Now\n\n### X\n- [ ] A\n### Y\n- [ ] B\n### X\n- [ ] C\n- [ ] D\n")).toBe("## Now\n\n### X\n- [ ] A\n- [ ] C\n- [ ] D\n### Y\n- [ ] B\n");
	});

	it("rule 7: top tasks join the ungrouped heading group at its start", () => {
		expect(run("## Now\n\n- [ ] A\n### X\n- [ ] B\n### No section\n- [ ] C\n")).toBe("## Now\n\n### X\n- [ ] B\n### No section\n- [ ] A\n- [ ] C\n");
	});

	it("rule 7: the ungrouped heading as the first ### goes", () => {
		expect(run("## Now\n\n### No section\n- [ ] A\n### X\n- [ ] B\n")).toBe("## Now\n\n- [ ] A\n### X\n- [ ] B\n");
	});

	it("rule 7 after rule 8: an emptied group above the ungrouped heading leaves it first, and it goes", () => {
		expect(run("## Now\n\n### X\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### No section\n- [ ] C\n### Y\n- [ ] D\n")).toBe("## Now\n\n- [ ] C\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### Y\n- [ ] D\n");
	});

	it("rule 8 keeps a group with text and no tasks", () => {
		const text = "## Now\n\n- [ ] A\n### X\nsome text\n";
		expect(run(text)).toBe(text);
	});

	it("rule 8 deletes an empty group and an empty ungrouped heading", () => {
		expect(run("## Now\n\n- [ ] A\n### X\n\n### Y\n- [ ] B\n### No section\n\n## Soon\n")).toBe("## Now\n\n- [ ] A\n### Y\n- [ ] B\n\n## Soon\n");
	});

	it("rule 4 puts today's Soon tasks at the start of No section, in order", () => {
		expect(run("## Now\n\n### X\n- [ ] A\n\n## Soon\n\n- [ ] S1 📅 2026-10-30\n- [ ] S2 📅 2026-10-30\n")).toBe("## Now\n\n- [ ] S1 📅 2026-10-30\n- [ ] S2 📅 2026-10-30\n### X\n- [ ] A\n\n## Soon\n\n");
	});

	it("leaves ### in Done alone", () => {
		const text = "## Done\n\n- [x] A\n### Old\n- [x] B\n\n### Empty\n";
		expect(run(text)).toBe(text);
	});

	it("is idempotent", () => {
		for (const text of [
			"## Now\n\n- [ ] A\n### Вечер\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n",
			"",
			"## Now\n\n### X\n- [ ] A\n### Y\n- [ ] B\n### X\n- [ ] C\n",
			"",
			"## Now\n\n- [ ] A\n### X\n- [ ] B\n### No section\n- [ ] C\n",
			"",
			"## Now\n\n### X\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### No section\n- [ ] C\n### Y\n- [ ] D\n",
			"",
			"## Now\n\n- [ ] A\n### X\n\n### Y\n- [ ] B\n### No section\n\n## Soon\n",
		]) {
			const once = normalize(TaskDocument.parse(text, G, M), T);
			expect(normalize(once, T).serialize()).toBe(once.serialize());
		}
	});
});

describe("one blank line under a list's heading", () => {
	it("puts one where there is none and makes one of several", () => {
		expect(normalize(parse("## Now\n- [ ] A\n\n## Soon\n\n\n\n- [ ] B\n\n## Done\n### X\n- [x] C\n"), T).serialize()).toBe(
			"## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] B\n\n## Done\n\n### X\n- [x] C\n",
		);
	});

	it("parts an empty list from the next heading with it, and leaves a heading with nothing below alone", () => {
		expect(normalize(parse("## Now\n## Soon\n- [ ] B\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n\n- [ ] B\n\n## Done\n");
	});

	it("leaves headings that are not the lists' alone", () => {
		const text = "## Notes\ntext\n\n## Now\n\n- [ ] A\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("a task that comes to an empty list stands under the blank line", () => {
		expect(normalize(parse("## Now\n\n### X\n- [ ] A\n\n## Soon\n\n- [ ] S 📅 2026-10-30\n"), T).serialize()).toBe(
			"## Now\n\n- [ ] S 📅 2026-10-30\n### X\n- [ ] A\n\n## Soon\n\n",
		);
	});
});

describe("one pass per rule", () => {
	const OVERDUE_SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };

	function overdue(): string {
		const lines = ["## Inbox"];
		for (let i = 0; i < 10; i++) lines.push(`- [ ] Inbox slot ${i} ⏰ 2026-10-29 0${i % 10}:00-0${i % 10}:30`);
		lines.push("", "## Now");
		for (let i = 0; i < 40; i++) lines.push(`- [${i % 3 === 0 ? "/" : " "}] Now slot ${i} ⏰ 2026-10-29 1${i % 10}:00${i % 2 ? "" : "-23:00"}${i % 4 === 0 ? " " : ""}`.trimEnd() + (i % 5 === 0 ? " 📅 2026-11-02" : ""));
		for (let i = 0; i < 80; i++) lines.push(`- [ ] Now due ${i} 📅 2026-10-${String(1 + (i % 29)).padStart(2, "0")}`, ...(i % 7 === 0 ? [`\t- note ${i}`, `\t- [ ] sub ${i} 📅 2026-10-01`] : []));
		lines.push("### Work");
		for (let i = 0; i < 20; i++) lines.push(`- [ ] Work due ${i} 📅 2026-09-${String(1 + i).padStart(2, "0")}`);
		lines.push("", "## Soon");
		for (let i = 0; i < 80; i++) lines.push(`- [ ] Soon due ${i} 📅 2026-10-${String(1 + (i % 29)).padStart(2, "0")}`, ...(i % 9 === 0 ? [`  - [x] done sub ${i}`] : []));
		lines.push("### Errands");
		for (let i = 0; i < 20; i++) lines.push(`- [/] Errand due ${i} 📅 2026-10-0${1 + (i % 9)}`);
		lines.push("- [ ] Later 📅 2026-12-01", "- [x] Closed 📅 2026-10-01", "", "## Done", "- [x] Old");
		return lines.join("\n") + "\n";
	}

	afterEach(() => vi.restoreAllMocks());

	it("rewrites 200 overdue tasks and 50 past slots as before, one rewrite of the document per rule and one more pass to find nothing left", () => {
		const doc = TaskDocument.parse(overdue(), OVERDUE_SECTIONS, M);
		const replace = vi.spyOn(TaskDocument.prototype, "replace");
		const replaceAll = vi.spyOn(TaskDocument.prototype, "replaceAll");
		expect(normalize(doc, T, undefined, ["Work"]).serialize()).toBe(OVERDUE_NORMALIZED);
		expect(replace).not.toHaveBeenCalled();
		expect(replaceAll).toHaveBeenCalledTimes(4);
	});

	it("gives back a normal document itself without writing it out", () => {
		const doc = parse("## Inbox\n\n- [ ] A\n\n## Now\n\n- [ ] B 📅 2026-10-30\n\n## Soon\n\n- [ ] C 📅 2026-11-02\n\n## Done\n\n- [x] D\n");
		const serialize = vi.spyOn(TaskDocument.prototype, "serialize");
		expect(normalize(doc, T)).toBe(doc);
		expect(serialize).not.toHaveBeenCalled();
	});
});

const OVERDUE_NORMALIZED = [
	"## Inbox",
	"",
	"## Now",
	"",
	"- [ ] Soon due 0 📅 2026-10-30",
	"  - [x] done sub 0",
	"- [ ] Soon due 1 📅 2026-10-30",
	"- [ ] Soon due 2 📅 2026-10-30",
	"- [ ] Soon due 3 📅 2026-10-30",
	"- [ ] Soon due 4 📅 2026-10-30",
	"- [ ] Soon due 5 📅 2026-10-30",
	"- [ ] Soon due 6 📅 2026-10-30",
	"- [ ] Soon due 7 📅 2026-10-30",
	"- [ ] Soon due 8 📅 2026-10-30",
	"- [ ] Soon due 9 📅 2026-10-30",
	"  - [x] done sub 9",
	"- [ ] Soon due 10 📅 2026-10-30",
	"- [ ] Soon due 11 📅 2026-10-30",
	"- [ ] Soon due 12 📅 2026-10-30",
	"- [ ] Soon due 13 📅 2026-10-30",
	"- [ ] Soon due 14 📅 2026-10-30",
	"- [ ] Soon due 15 📅 2026-10-30",
	"- [ ] Soon due 16 📅 2026-10-30",
	"- [ ] Soon due 17 📅 2026-10-30",
	"- [ ] Soon due 18 📅 2026-10-30",
	"  - [x] done sub 18",
	"- [ ] Soon due 19 📅 2026-10-30",
	"- [ ] Soon due 20 📅 2026-10-30",
	"- [ ] Soon due 21 📅 2026-10-30",
	"- [ ] Soon due 22 📅 2026-10-30",
	"- [ ] Soon due 23 📅 2026-10-30",
	"- [ ] Soon due 24 📅 2026-10-30",
	"- [ ] Soon due 25 📅 2026-10-30",
	"- [ ] Soon due 26 📅 2026-10-30",
	"- [ ] Soon due 27 📅 2026-10-30",
	"  - [x] done sub 27",
	"- [ ] Soon due 28 📅 2026-10-30",
	"- [ ] Soon due 29 📅 2026-10-30",
	"- [ ] Soon due 30 📅 2026-10-30",
	"- [ ] Soon due 31 📅 2026-10-30",
	"- [ ] Soon due 32 📅 2026-10-30",
	"- [ ] Soon due 33 📅 2026-10-30",
	"- [ ] Soon due 34 📅 2026-10-30",
	"- [ ] Soon due 35 📅 2026-10-30",
	"- [ ] Soon due 36 📅 2026-10-30",
	"  - [x] done sub 36",
	"- [ ] Soon due 37 📅 2026-10-30",
	"- [ ] Soon due 38 📅 2026-10-30",
	"- [ ] Soon due 39 📅 2026-10-30",
	"- [ ] Soon due 40 📅 2026-10-30",
	"- [ ] Soon due 41 📅 2026-10-30",
	"- [ ] Soon due 42 📅 2026-10-30",
	"- [ ] Soon due 43 📅 2026-10-30",
	"- [ ] Soon due 44 📅 2026-10-30",
	"- [ ] Soon due 45 📅 2026-10-30",
	"  - [x] done sub 45",
	"- [ ] Soon due 46 📅 2026-10-30",
	"- [ ] Soon due 47 📅 2026-10-30",
	"- [ ] Soon due 48 📅 2026-10-30",
	"- [ ] Soon due 49 📅 2026-10-30",
	"- [ ] Soon due 50 📅 2026-10-30",
	"- [ ] Soon due 51 📅 2026-10-30",
	"- [ ] Soon due 52 📅 2026-10-30",
	"- [ ] Soon due 53 📅 2026-10-30",
	"- [ ] Soon due 54 📅 2026-10-30",
	"  - [x] done sub 54",
	"- [ ] Soon due 55 📅 2026-10-30",
	"- [ ] Soon due 56 📅 2026-10-30",
	"- [ ] Soon due 57 📅 2026-10-30",
	"- [ ] Soon due 58 📅 2026-10-30",
	"- [ ] Soon due 59 📅 2026-10-30",
	"- [ ] Soon due 60 📅 2026-10-30",
	"- [ ] Soon due 61 📅 2026-10-30",
	"- [ ] Soon due 62 📅 2026-10-30",
	"- [ ] Soon due 63 📅 2026-10-30",
	"  - [x] done sub 63",
	"- [ ] Soon due 64 📅 2026-10-30",
	"- [ ] Soon due 65 📅 2026-10-30",
	"- [ ] Soon due 66 📅 2026-10-30",
	"- [ ] Soon due 67 📅 2026-10-30",
	"- [ ] Soon due 68 📅 2026-10-30",
	"- [ ] Soon due 69 📅 2026-10-30",
	"- [ ] Soon due 70 📅 2026-10-30",
	"- [ ] Soon due 71 📅 2026-10-30",
	"- [ ] Soon due 72 📅 2026-10-30",
	"  - [x] done sub 72",
	"- [ ] Soon due 73 📅 2026-10-30",
	"- [ ] Soon due 74 📅 2026-10-30",
	"- [ ] Soon due 75 📅 2026-10-30",
	"- [ ] Soon due 76 📅 2026-10-30",
	"- [ ] Soon due 77 📅 2026-10-30",
	"- [ ] Soon due 78 📅 2026-10-30",
	"- [ ] Soon due 79 📅 2026-10-30",
	"- [ ] Inbox slot 0 📅 2026-10-30",
	"- [ ] Inbox slot 1 📅 2026-10-30",
	"- [ ] Inbox slot 2 📅 2026-10-30",
	"- [ ] Inbox slot 3 📅 2026-10-30",
	"- [ ] Inbox slot 4 📅 2026-10-30",
	"- [ ] Inbox slot 5 📅 2026-10-30",
	"- [ ] Inbox slot 6 📅 2026-10-30",
	"- [ ] Inbox slot 7 📅 2026-10-30",
	"- [ ] Inbox slot 8 📅 2026-10-30",
	"- [ ] Inbox slot 9 📅 2026-10-30",
	"- [/] Now slot 0 📅 2026-11-02",
	"- [ ] Now slot 1 📅 2026-10-30",
	"- [ ] Now slot 2 📅 2026-10-30",
	"- [/] Now slot 3 📅 2026-10-30",
	"- [ ] Now slot 4 📅 2026-10-30",
	"- [ ] Now slot 5 📅 2026-11-02",
	"- [/] Now slot 6 📅 2026-10-30",
	"- [ ] Now slot 7 📅 2026-10-30",
	"- [ ] Now slot 8 📅 2026-10-30",
	"- [/] Now slot 9 📅 2026-10-30",
	"- [ ] Now slot 10 📅 2026-11-02",
	"- [ ] Now slot 11 📅 2026-10-30",
	"- [/] Now slot 12 📅 2026-10-30",
	"- [ ] Now slot 13 📅 2026-10-30",
	"- [ ] Now slot 14 📅 2026-10-30",
	"- [/] Now slot 15 📅 2026-11-02",
	"- [ ] Now slot 16 📅 2026-10-30",
	"- [ ] Now slot 17 📅 2026-10-30",
	"- [/] Now slot 18 📅 2026-10-30",
	"- [ ] Now slot 19 📅 2026-10-30",
	"- [ ] Now slot 20 📅 2026-11-02",
	"- [/] Now slot 21 📅 2026-10-30",
	"- [ ] Now slot 22 📅 2026-10-30",
	"- [ ] Now slot 23 📅 2026-10-30",
	"- [/] Now slot 24 📅 2026-10-30",
	"- [ ] Now slot 25 📅 2026-11-02",
	"- [ ] Now slot 26 📅 2026-10-30",
	"- [/] Now slot 27 📅 2026-10-30",
	"- [ ] Now slot 28 📅 2026-10-30",
	"- [ ] Now slot 29 📅 2026-10-30",
	"- [/] Now slot 30 📅 2026-11-02",
	"- [ ] Now slot 31 📅 2026-10-30",
	"- [ ] Now slot 32 📅 2026-10-30",
	"- [/] Now slot 33 📅 2026-10-30",
	"- [ ] Now slot 34 📅 2026-10-30",
	"- [ ] Now slot 35 📅 2026-11-02",
	"- [/] Now slot 36 📅 2026-10-30",
	"- [ ] Now slot 37 📅 2026-10-30",
	"- [ ] Now slot 38 📅 2026-10-30",
	"- [/] Now slot 39 📅 2026-10-30",
	"- [ ] Now due 0 📅 2026-10-30",
	"\t- note 0",
	"\t- [ ] sub 0 📅 2026-10-01",
	"- [ ] Now due 1 📅 2026-10-30",
	"- [ ] Now due 2 📅 2026-10-30",
	"- [ ] Now due 3 📅 2026-10-30",
	"- [ ] Now due 4 📅 2026-10-30",
	"- [ ] Now due 5 📅 2026-10-30",
	"- [ ] Now due 6 📅 2026-10-30",
	"- [ ] Now due 7 📅 2026-10-30",
	"\t- note 7",
	"\t- [ ] sub 7 📅 2026-10-01",
	"- [ ] Now due 8 📅 2026-10-30",
	"- [ ] Now due 9 📅 2026-10-30",
	"- [ ] Now due 10 📅 2026-10-30",
	"- [ ] Now due 11 📅 2026-10-30",
	"- [ ] Now due 12 📅 2026-10-30",
	"- [ ] Now due 13 📅 2026-10-30",
	"- [ ] Now due 14 📅 2026-10-30",
	"\t- note 14",
	"\t- [ ] sub 14 📅 2026-10-01",
	"- [ ] Now due 15 📅 2026-10-30",
	"- [ ] Now due 16 📅 2026-10-30",
	"- [ ] Now due 17 📅 2026-10-30",
	"- [ ] Now due 18 📅 2026-10-30",
	"- [ ] Now due 19 📅 2026-10-30",
	"- [ ] Now due 20 📅 2026-10-30",
	"- [ ] Now due 21 📅 2026-10-30",
	"\t- note 21",
	"\t- [ ] sub 21 📅 2026-10-01",
	"- [ ] Now due 22 📅 2026-10-30",
	"- [ ] Now due 23 📅 2026-10-30",
	"- [ ] Now due 24 📅 2026-10-30",
	"- [ ] Now due 25 📅 2026-10-30",
	"- [ ] Now due 26 📅 2026-10-30",
	"- [ ] Now due 27 📅 2026-10-30",
	"- [ ] Now due 28 📅 2026-10-30",
	"\t- note 28",
	"\t- [ ] sub 28 📅 2026-10-01",
	"- [ ] Now due 29 📅 2026-10-30",
	"- [ ] Now due 30 📅 2026-10-30",
	"- [ ] Now due 31 📅 2026-10-30",
	"- [ ] Now due 32 📅 2026-10-30",
	"- [ ] Now due 33 📅 2026-10-30",
	"- [ ] Now due 34 📅 2026-10-30",
	"- [ ] Now due 35 📅 2026-10-30",
	"\t- note 35",
	"\t- [ ] sub 35 📅 2026-10-01",
	"- [ ] Now due 36 📅 2026-10-30",
	"- [ ] Now due 37 📅 2026-10-30",
	"- [ ] Now due 38 📅 2026-10-30",
	"- [ ] Now due 39 📅 2026-10-30",
	"- [ ] Now due 40 📅 2026-10-30",
	"- [ ] Now due 41 📅 2026-10-30",
	"- [ ] Now due 42 📅 2026-10-30",
	"\t- note 42",
	"\t- [ ] sub 42 📅 2026-10-01",
	"- [ ] Now due 43 📅 2026-10-30",
	"- [ ] Now due 44 📅 2026-10-30",
	"- [ ] Now due 45 📅 2026-10-30",
	"- [ ] Now due 46 📅 2026-10-30",
	"- [ ] Now due 47 📅 2026-10-30",
	"- [ ] Now due 48 📅 2026-10-30",
	"- [ ] Now due 49 📅 2026-10-30",
	"\t- note 49",
	"\t- [ ] sub 49 📅 2026-10-01",
	"- [ ] Now due 50 📅 2026-10-30",
	"- [ ] Now due 51 📅 2026-10-30",
	"- [ ] Now due 52 📅 2026-10-30",
	"- [ ] Now due 53 📅 2026-10-30",
	"- [ ] Now due 54 📅 2026-10-30",
	"- [ ] Now due 55 📅 2026-10-30",
	"- [ ] Now due 56 📅 2026-10-30",
	"\t- note 56",
	"\t- [ ] sub 56 📅 2026-10-01",
	"- [ ] Now due 57 📅 2026-10-30",
	"- [ ] Now due 58 📅 2026-10-30",
	"- [ ] Now due 59 📅 2026-10-30",
	"- [ ] Now due 60 📅 2026-10-30",
	"- [ ] Now due 61 📅 2026-10-30",
	"- [ ] Now due 62 📅 2026-10-30",
	"- [ ] Now due 63 📅 2026-10-30",
	"\t- note 63",
	"\t- [ ] sub 63 📅 2026-10-01",
	"- [ ] Now due 64 📅 2026-10-30",
	"- [ ] Now due 65 📅 2026-10-30",
	"- [ ] Now due 66 📅 2026-10-30",
	"- [ ] Now due 67 📅 2026-10-30",
	"- [ ] Now due 68 📅 2026-10-30",
	"- [ ] Now due 69 📅 2026-10-30",
	"- [ ] Now due 70 📅 2026-10-30",
	"\t- note 70",
	"\t- [ ] sub 70 📅 2026-10-01",
	"- [ ] Now due 71 📅 2026-10-30",
	"- [ ] Now due 72 📅 2026-10-30",
	"- [ ] Now due 73 📅 2026-10-30",
	"- [ ] Now due 74 📅 2026-10-30",
	"- [ ] Now due 75 📅 2026-10-30",
	"- [ ] Now due 76 📅 2026-10-30",
	"- [ ] Now due 77 📅 2026-10-30",
	"\t- note 77",
	"\t- [ ] sub 77 📅 2026-10-01",
	"- [ ] Now due 78 📅 2026-10-30",
	"- [ ] Now due 79 📅 2026-10-30",
	"### Work",
	"- [ ] Work due 0 📅 2026-10-30",
	"- [ ] Work due 1 📅 2026-10-30",
	"- [ ] Work due 2 📅 2026-10-30",
	"- [ ] Work due 3 📅 2026-10-30",
	"- [ ] Work due 4 📅 2026-10-30",
	"- [ ] Work due 5 📅 2026-10-30",
	"- [ ] Work due 6 📅 2026-10-30",
	"- [ ] Work due 7 📅 2026-10-30",
	"- [ ] Work due 8 📅 2026-10-30",
	"- [ ] Work due 9 📅 2026-10-30",
	"- [ ] Work due 10 📅 2026-10-30",
	"- [ ] Work due 11 📅 2026-10-30",
	"- [ ] Work due 12 📅 2026-10-30",
	"- [ ] Work due 13 📅 2026-10-30",
	"- [ ] Work due 14 📅 2026-10-30",
	"- [ ] Work due 15 📅 2026-10-30",
	"- [ ] Work due 16 📅 2026-10-30",
	"- [ ] Work due 17 📅 2026-10-30",
	"- [ ] Work due 18 📅 2026-10-30",
	"- [ ] Work due 19 📅 2026-10-30",
	"### Errands",
	"- [/] Errand due 0 📅 2026-10-30",
	"- [/] Errand due 1 📅 2026-10-30",
	"- [/] Errand due 2 📅 2026-10-30",
	"- [/] Errand due 3 📅 2026-10-30",
	"- [/] Errand due 4 📅 2026-10-30",
	"- [/] Errand due 5 📅 2026-10-30",
	"- [/] Errand due 6 📅 2026-10-30",
	"- [/] Errand due 7 📅 2026-10-30",
	"- [/] Errand due 8 📅 2026-10-30",
	"- [/] Errand due 9 📅 2026-10-30",
	"- [/] Errand due 10 📅 2026-10-30",
	"- [/] Errand due 11 📅 2026-10-30",
	"- [/] Errand due 12 📅 2026-10-30",
	"- [/] Errand due 13 📅 2026-10-30",
	"- [/] Errand due 14 📅 2026-10-30",
	"- [/] Errand due 15 📅 2026-10-30",
	"- [/] Errand due 16 📅 2026-10-30",
	"- [/] Errand due 17 📅 2026-10-30",
	"- [/] Errand due 18 📅 2026-10-30",
	"- [/] Errand due 19 📅 2026-10-30",
	"",
	"## Soon",
	"",
	"### Errands",
	"- [ ] Later 📅 2026-12-01",
	"",
	"## Done",
	"",
	"- [x] Closed 📅 2026-10-01",
	"- [x] Old",
	"",
].join("\n");

import { describe, expect, it } from "vitest";
import { normalize } from "../../src/domain/normalize";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { TaskDocument } from "../../src/domain/TaskDocument";

const AT_FOUR = new DayBoundary(4);

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("rule 1: past slots", () => {
	it("erases a past slot and keeps the due date", () => {
		expect(normalize(parse("## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-29 10:00-11:00\n"), T).serialize()).toBe("## Now\n- [ ] A 📅 2026-11-03\n");
	});

	it("leaves today's and future slots", () => {
		const text = "## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n- [/] B ⏰ 2026-11-01 10:00-11:00\n\n## Done\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("does not touch done tasks", () => {
		const text = "## Done\n- [x] A ⏰ 2026-10-29 10:00-11:00\n- [-] B ⏰ 2026-10-29 10:00-11:00\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("erases past slots in Soon and in-progress tasks too", () => {
		expect(normalize(parse("## Soon\n- [/] A ⏰ 2026-10-29 10:00-11:00\n- [ ] B ⏰ 2026-10-01 10:00-11:00\n"), T).serialize()).toBe(
			"## Soon\n- [/] A 📅 2026-10-30\n- [ ] B 📅 2026-10-30\n",
		);
	});

	it("gives a task left without a date the slot's day, which turns into today", () => {
		expect(normalize(parse("## Now\n- [ ] A ⏰ 2026-10-29 10:00-11:00\n"), T).serialize()).toBe("## Now\n- [ ] A 📅 2026-10-30\n");
	});
});

describe("past due dates", () => {
	it("an open task's past due date becomes today's", () => {
		expect(normalize(parse("## Now\n- [ ] A 📅 2026-10-28\n- [/] B 📅 2026-10-01\n- [ ] C 📅 2026-11-01\n- [ ] D\n"), T).serialize()).toBe(
			"## Now\n- [ ] A 📅 2026-10-30\n- [/] B 📅 2026-10-30\n- [ ] C 📅 2026-11-01\n- [ ] D\n",
		);
	});

	it("a closed task keeps its date", () => {
		const text = "## Done\n- [x] A 📅 2026-10-28\n- [-] B 📅 2026-10-28\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("rule 2: done and cancelled", () => {
	it("moves done and cancelled to the start of Done, keeping their order", () => {
		expect(normalize(parse("## Now\n- [x] A\n- [ ] B\n- [-] C\n\n## Done\n- [x] Old\n"), T).serialize()).toBe("## Now\n- [ ] B\n\n## Done\n- [x] A\n- [-] C\n- [x] Old\n");
	});

	it("takes them from Soon with their children", () => {
		expect(normalize(parse("## Now\n- [x] A\n\n## Soon\n- [x] S\n  - note\n- [ ] T\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n- [ ] T\n\n## Done\n- [x] A\n- [x] S\n  - note\n");
	});

	it("skips the rule when there is no Done section", () => {
		const text = "## Now\n- [x] A\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("rule 4: Soon tasks due today or earlier", () => {
	it("moves a Soon task due today or earlier to the start of Now", () => {
		expect(normalize(parse("## Now\n- [ ] N\n\n## Soon\n- [ ] S 📅 2026-10-30\n- [ ] Later 📅 2026-11-01\n"), T).serialize()).toBe(
			"## Now\n- [ ] S 📅 2026-10-30\n- [ ] N\n\n## Soon\n- [ ] Later 📅 2026-11-01\n",
		);
	});

	it("moves overdue tasks in file order, keeping it", () => {
		expect(normalize(parse("## Now\n- [ ] N\n\n## Soon\n- [ ] A 📅 2026-10-01\n- [ ] X\n- [/] B 📅 2026-10-29\n"), T).serialize()).toBe(
			"## Now\n- [ ] A 📅 2026-10-30\n- [/] B 📅 2026-10-30\n- [ ] N\n\n## Soon\n- [ ] X\n",
		);
	});

	it("also fires on a slot dated today", () => {
		expect(normalize(parse("## Now\n\n## Soon\n- [ ] S ⏰ 2026-10-30 10:00-11:00\n"), T).serialize()).toBe("## Now\n- [ ] S ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n");
	});

	it("does not move a done Soon task to Now", () => {
		expect(normalize(parse("## Now\n\n## Soon\n- [x] S 📅 2026-10-30\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n\n## Done\n- [x] S 📅 2026-10-30\n");
	});

	it("skips the rule when there is no Now section", () => {
		const text = "## Soon\n- [ ] S 📅 2026-10-30\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("as a whole", () => {
	const messy = "## Now\n- [ ] A ⏰ 2026-10-29 10:00-11:00\n- [x] B\n\n## Soon\n- [ ] C 📅 2026-10-29 ⏰ 2026-10-28 09:00-10:00\n- [-] D\n- [ ] E\n\n## Done\n- [x] Old\n";

	it("applies the rules in order with one result", () => {
		expect(normalize(parse(messy), T).serialize()).toBe("## Now\n- [ ] C 📅 2026-10-30\n- [ ] A 📅 2026-10-30\n\n## Soon\n- [ ] E\n\n## Done\n- [x] B\n- [-] D\n- [x] Old\n");
	});

	it("is idempotent", () => {
		const once = normalize(parse(messy), T);
		expect(normalize(once, T)).toBe(once);
	});

	it("returns the same object when nothing changes", () => {
		const clean = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] B 📅 2026-11-01\n\n## Done\n- [x] C\n");
		expect(normalize(clean, T)).toBe(clean);
	});
});

describe("a day that starts at 4", () => {
	it("erases a slot before 4 today: it belonged to the day before", () => {
		const text = "## Now\n- [ ] A ⏰ 2026-10-30 02:00-03:00\n";
		expect(normalize(parse(text), T, AT_FOUR).serialize()).toBe("## Now\n- [ ] A 📅 2026-10-30\n");
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("keeps a slot after midnight of today and brings its Soon task to Now", () => {
		expect(normalize(parse("## Now\n\n## Soon\n- [ ] S ⏰ 2026-10-31 01:00-02:00\n"), T, AT_FOUR).serialize()).toBe("## Now\n- [ ] S ⏰ 2026-10-31 01:00-02:00\n\n## Soon\n");
	});
});

describe("rule 3: a sorted Inbox task leaves Inbox", () => {
	it("a due date in the future sends it to the end of Soon", () => {
		expect(normalize(parse("## Inbox\n- [ ] A 📅 2026-11-03\n- [ ] B\n\n## Now\n\n## Soon\n- [ ] S\n"), T).serialize()).toBe("## Inbox\n- [ ] B\n\n## Now\n\n## Soon\n- [ ] S\n- [ ] A 📅 2026-11-03\n");
	});

	it("a due date today or a slot today ends in Now", () => {
		expect(normalize(parse("## Inbox\n- [ ] A 📅 2026-10-30\n- [/] B ⏰ 2026-10-30 10:00-11:00\n\n## Now\n- [ ] N\n\n## Soon\n"), T).serialize()).toBe("## Inbox\n\n## Now\n- [ ] A 📅 2026-10-30\n- [/] B ⏰ 2026-10-30 10:00-11:00\n- [ ] N\n\n## Soon\n");
	});

	it("a task without fields stays; one whose past slot was erased keeps today's date and leaves", () => {
		expect(normalize(parse("## Inbox\n- [ ] A\n- [ ] B ⏰ 2026-10-29 10:00-11:00\n\n## Soon\n"), T).serialize()).toBe("## Inbox\n- [ ] A\n\n## Soon\n- [ ] B 📅 2026-10-30\n");
	});

	it("a done or cancelled Inbox task goes to Done", () => {
		expect(normalize(parse("## Inbox\n- [x] A\n- [ ] B\n- [-] C\n\n## Done\n- [x] Old\n"), T).serialize()).toBe("## Inbox\n- [ ] B\n\n## Done\n- [x] A\n- [-] C\n- [x] Old\n");
	});

	it("waits while the file has no Soon", () => {
		const text = "## Inbox\n- [ ] A 📅 2026-11-03\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("sections: rules 5-8", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const run = (text: string) => normalize(TaskDocument.parse(text, G, M), T).serialize();

	it("rule 5: a slotted task leaves its group, and the empty group goes (rule 8)", () => {
		expect(run("## Now\n- [ ] A\n### Вечер\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### X\n- [ ] C\n")).toBe("## Now\n- [ ] A\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### X\n- [ ] C\n");
	});

	it("rule 5: a Now task due tomorrow leaves its group", () => {
		expect(run("## Now\n- [ ] A\n### X\n- [ ] B 📅 2026-10-31\n- [ ] C\n")).toBe("## Now\n- [ ] A\n- [ ] B 📅 2026-10-31\n### X\n- [ ] C\n");
	});

	it("rule 5: a Soon task with a due date keeps its group, a slotted one leaves it", () => {
		const dated = "## Soon\n### X\n- [ ] B 📅 2026-11-03\n- [ ] C\n";
		expect(run(dated)).toBe(dated);
		expect(run("## Soon\n### X\n- [ ] B ⏰ 2026-11-03 10:00-11:00\n- [ ] C\n")).toBe("## Soon\n- [ ] B ⏰ 2026-11-03 10:00-11:00\n### X\n- [ ] C\n");
	});

	it("rule 4 takes a Soon task whose day came into Now's section of the same name", () => {
		expect(run("## Now\n- [ ] N\n### Morning\n- [ ] M\n\n## Soon\n### Morning\n- [ ] A 📅 2026-10-30\n- [ ] Later 📅 2026-11-03\n")).toBe(
			"## Now\n- [ ] N\n### Morning\n- [ ] M\n- [ ] A 📅 2026-10-30\n\n## Soon\n### Morning\n- [ ] Later 📅 2026-11-03\n",
		);
	});

	it("rule 4 makes the section in Now when it is missing, a preset in the presets' order", () => {
		const doc = TaskDocument.parse("## Now\n- [ ] N\n### Evening\n- [ ] E\n\n## Soon\n### Morning\n- [ ] A 📅 2026-10-30\n### Trip\n- [ ] B 📅 2026-10-30\n", G, M);
		expect(normalize(doc, T, undefined, ["Morning", "Afternoon", "Evening"]).serialize()).toBe(
			"## Now\n- [ ] N\n### Morning\n- [ ] A 📅 2026-10-30\n### Evening\n- [ ] E\n### Trip\n- [ ] B 📅 2026-10-30\n\n## Soon\n",
		);
	});

	it("rule 5: an Inbox group keeps any task", () => {
		const text = "## Inbox\n### X\n- [ ] B\n";
		expect(run(text)).toBe(text);
	});

	it("rule 6: duplicates merge into the first, in order", () => {
		expect(run("## Now\n### X\n- [ ] A\n### Y\n- [ ] B\n### X\n- [ ] C\n- [ ] D\n")).toBe("## Now\n### X\n- [ ] A\n- [ ] C\n- [ ] D\n### Y\n- [ ] B\n");
	});

	it("rule 7: top tasks join the ungrouped heading group at its start", () => {
		expect(run("## Now\n- [ ] A\n### X\n- [ ] B\n### No section\n- [ ] C\n")).toBe("## Now\n### X\n- [ ] B\n### No section\n- [ ] A\n- [ ] C\n");
	});

	it("rule 7: the ungrouped heading as the first ### goes", () => {
		expect(run("## Now\n### No section\n- [ ] A\n### X\n- [ ] B\n")).toBe("## Now\n- [ ] A\n### X\n- [ ] B\n");
	});

	it("rule 7 after rule 8: an emptied group above the ungrouped heading leaves it first, and it goes", () => {
		expect(run("## Now\n### X\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### No section\n- [ ] C\n### Y\n- [ ] D\n")).toBe("## Now\n- [ ] C\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### Y\n- [ ] D\n");
	});

	it("rule 8 keeps a group with text and no tasks", () => {
		const text = "## Now\n- [ ] A\n### X\nsome text\n";
		expect(run(text)).toBe(text);
	});

	it("rule 8 deletes an empty group and an empty ungrouped heading", () => {
		expect(run("## Now\n- [ ] A\n### X\n\n### Y\n- [ ] B\n### No section\n\n## Soon\n")).toBe("## Now\n- [ ] A\n### Y\n- [ ] B\n\n## Soon\n");
	});

	it("rule 4 puts today's Soon tasks at the start of No section, in order", () => {
		expect(run("## Now\n### X\n- [ ] A\n\n## Soon\n- [ ] S1 📅 2026-10-30\n- [ ] S2 📅 2026-10-30\n")).toBe("## Now\n- [ ] S1 📅 2026-10-30\n- [ ] S2 📅 2026-10-30\n### X\n- [ ] A\n\n## Soon\n");
	});

	it("leaves ### in Done alone", () => {
		const text = "## Done\n- [x] A\n### Old\n- [x] B\n\n### Empty\n";
		expect(run(text)).toBe(text);
	});

	it("is idempotent", () => {
		for (const text of [
			"## Now\n- [ ] A\n### Вечер\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n",
			"## Now\n### X\n- [ ] A\n### Y\n- [ ] B\n### X\n- [ ] C\n",
			"## Now\n- [ ] A\n### X\n- [ ] B\n### No section\n- [ ] C\n",
			"## Now\n### X\n- [ ] B ⏰ 2026-10-30 18:00-19:00\n### No section\n- [ ] C\n### Y\n- [ ] D\n",
			"## Now\n- [ ] A\n### X\n\n### Y\n- [ ] B\n### No section\n\n## Soon\n",
		]) {
			const once = normalize(TaskDocument.parse(text, G, M), T);
			expect(normalize(once, T).serialize()).toBe(once.serialize());
		}
	});
});

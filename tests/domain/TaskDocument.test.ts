import { describe, expect, it } from "vitest";
import type { Task } from "../../src/domain/Task";
import { TaskDocument, ungroupedIndex } from "../../src/domain/TaskDocument";
import type { Markers } from "../../src/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const ALL = ["Inbox", "Now", "Soon", "Backlog", "Done"];
const TEXT = `---\ntags: [todo]\n---\n# Список\n\n## Inbox\n- [ ] В инбоксе\n\n## Now\n- [ ] Первая\n- [/] Вторая ⏰ 2026-10-30 14:00-15:00\n  - заметка\n  - [ ] подпункт\n## Soon\n- [ ] Третья 📅 2026-11-03\nПросто текст\n\n## Backlog\n- [ ] Бэклог\n\n## Done\n- [x] Готово\n`;

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

function task(text: string, patch: Partial<Task> = {}): Task {
	return { status: "todo", statusChar: " ", text, dueDate: null, slot: null, priority: null, children: [], ...patch };
}

describe("TaskDocument.parse", () => {
	it("round-trips byte for byte", () => {
		expect(parse(TEXT).serialize()).toBe(TEXT);
		expect(parse("").serialize()).toBe("");
		expect(parse("## Now\n- [ ] A").serialize()).toBe("## Now\n- [ ] A");
		expect(parse("## Now\r\n- [ ] A\r\n").serialize()).toBe("## Now\r\n- [ ] A\r\n");
	});

	it("reads tasks of the four sections only, never Backlog", () => {
		const d = parse(TEXT);
		expect(d.tasks("inbox").map((e) => e.task.text)).toEqual(["В инбоксе"]);
		expect(d.tasks("now").map((e) => e.task.text)).toEqual(["Первая", "Вторая"]);
		expect(d.tasks("now")[1].task.children).toEqual(["  - заметка", "  - [ ] подпункт"]);
		expect(d.tasks("soon").map((e) => e.task.text)).toEqual(["Третья"]);
		expect(d.tasks("done")).toHaveLength(1);
	});

	it("gives every entry its section, index and raw line", () => {
		const d = parse(TEXT);
		expect(d.tasks("now")[1]).toMatchObject({ section: "now", index: 1, raw: "- [/] Вторая ⏰ 2026-10-30 14:00-15:00", indent: "", bullet: "-" });
		expect(d.allTasks().map((e) => [e.section, e.index])).toEqual([["inbox", 0], ["now", 0], ["now", 1], ["soon", 0], ["done", 0]]);
	});

	it("knows which sections exist", () => {
		const d = parse("## Now\n- [ ] A\n");
		expect(d.hasSection("now")).toBe(true);
		expect(d.hasSection("soon")).toBe(false);
		expect(d.tasks("soon")).toEqual([]);
	});

	it("ignores a task-like line outside the three sections", () => {
		expect(parse("- [ ] outside\n## Now\n").allTasks()).toHaveLength(0);
	});

	it("ends a section at a first or second level heading and matches the name after trim", () => {
		const d = parse("##  Now  \n- [ ] A\n# Top\n- [ ] not now\n## Soon\n- [ ] S\n### Sub\n- [ ] in a group of Soon\n## Done\n");
		expect(d.tasks("now").map((e) => e.task.text)).toEqual(["A"]);
		expect(d.tasks("soon").map((e) => e.task.text)).toEqual(["S", "in a group of Soon"]);
	});

	it("stops the children at a blank line or a shallower line", () => {
		const d = parse("## Now\n- [ ] A\n\tdeep\n\n\tnot a child\n- [ ] B\n  - child of B\nplain\n");
		expect(d.tasks("now")[0].task.children).toEqual(["\tdeep"]);
		expect(d.tasks("now")[1].task.children).toEqual(["  - child of B"]);
		expect(d.tasks("now")).toHaveLength(2);
	});

	it("does not treat a child task line as a task of the section", () => {
		expect(parse("## Now\n- [ ] A\n  - [ ] child\n").tasks("now")).toHaveLength(1);
	});
});

describe("TaskDocument operations", () => {
	it("moves a task with its children to the start of Done without touching the next heading", () => {
		const d = parse(TEXT);
		const out = d.moveEntry(d.tasks("now")[1], "done", "start").serialize();
		expect(out).toContain("## Now\n- [ ] Первая\n## Soon\n");
		expect(out).toContain("## Done\n- [/] Вторая ⏰ 2026-10-30 14:00-15:00\n  - заметка\n  - [ ] подпункт\n- [x] Готово\n");
	});

	it("moves to the end of another section", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n");
		expect(d.moveEntry(d.tasks("now")[0], "soon", "end").serialize()).toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A\n");
	});

	it("moves before a later task of the same section by its current index", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n- [ ] C\n");
		expect(d.moveEntry(d.tasks("now")[0], "now", 2).serialize()).toBe("## Now\n- [ ] B\n- [ ] A\n- [ ] C\n");
		expect(d.moveEntry(d.tasks("now")[2], "now", 0).serialize()).toBe("## Now\n- [ ] C\n- [ ] A\n- [ ] B\n");
	});

	it("moves into an empty section right after its heading", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n\n## Done\n");
		expect(d.moveEntry(d.tasks("now")[0], "done", "start").serialize()).toBe("## Now\n\n## Soon\n\n## Done\n- [ ] A\n");
	});

	it("inserts at the end of a section before the blank line that separates sections", () => {
		const d = parse("## Now\n- [ ] A\n\n## Soon\n");
		expect(d.insert("now", "end", task("B")).serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n");
		expect(d.insert("soon", "end", task("B")).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n- [ ] B\n");
	});

	it("inserts before the task at a numeric position", () => {
		const d = parse("## Now\n- [ ] A\n- [ ] B\n");
		expect(d.insert("now", 0, task("X")).serialize()).toBe("## Now\n- [ ] X\n- [ ] A\n- [ ] B\n");
		expect(d.insert("now", 1, task("X", { dueDate: "2026-11-03" })).serialize()).toBe("## Now\n- [ ] A\n- [ ] X 📅 2026-11-03\n- [ ] B\n");
		expect(d.insert("now", 5, task("X")).serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n- [ ] X\n");
	});

	it("inserts into a file without a trailing newline", () => {
		expect(parse("## Now\n- [ ] A").insert("now", "end", task("B")).serialize()).toBe("## Now\n- [ ] A\n- [ ] B");
	});

	it("throws when inserting into a missing section", () => {
		expect(() => parse("## Now\n").insert("soon", "end", task("B"))).toThrow();
	});

	it("keeps raw when the task did not change", () => {
		const d = parse("## Now\n-   [ ]   A  \n");
		const e = d.tasks("now")[0];
		expect(d.replace(e, e.task).serialize()).toBe("## Now\n-   [ ]   A  \n");
		expect(d.replace(e, { ...e.task, status: "done", statusChar: "x" }).serialize()).toBe("## Now\n- [x] A\n");
	});

	it("replace keeps the children and the position", () => {
		const d = parse("## Now\n- [ ] A\n  - note\n- [ ] B\n");
		const e = d.tasks("now")[0];
		expect(d.replace(e, { ...e.task, text: "A2" }).serialize()).toBe("## Now\n- [ ] A2\n  - note\n- [ ] B\n");
	});

	it("removes an entry with its children", () => {
		const d = parse("## Now\n- [ ] A\n  - x\n- [ ] B\n## Soon\n");
		expect(d.removeEntry(d.tasks("now")[0]).serialize()).toBe("## Now\n- [ ] B\n## Soon\n");
		expect(d.removeEntry(d.tasks("now")[1]).serialize()).toBe("## Now\n- [ ] A\n  - x\n## Soon\n");
	});

	it("rejects an entry that no longer matches the document", () => {
		const d = parse("## Now\n- [ ] A\n");
		const e = parse("## Now\n- [ ] Other\n").tasks("now")[0];
		expect(() => d.removeEntry(e)).toThrow();
	});

	it("adds missing sections at the end", () => {
		expect(parse("## Now\n- [ ] A\n").ensureSections(ALL).serialize()).toBe("## Now\n- [ ] A\n\n## Inbox\n\n## Soon\n\n## Backlog\n\n## Done\n");
		expect(parse("## Now\n- [ ] A").ensureSections(["Now", "Soon"]).serialize()).toBe("## Now\n- [ ] A\n\n## Soon\n");
		expect(parse("## Now\n\n").ensureSections(["Now", "Soon"]).serialize()).toBe("## Now\n\n## Soon\n");
	});

	it("returns the same document when every section exists", () => {
		const d = parse(TEXT);
		expect(d.ensureSections(ALL)).toBe(d);
	});

	it("builds an empty file with every section", () => {
		expect(TaskDocument.empty(ALL)).toBe("## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n");
	});
});

describe("groups inside a list", () => {
	const G = { ...SECTIONS, ungrouped: "No section" };
	const parseG = (text: string) => TaskDocument.parse(text, G, M);
	const shape = (d: TaskDocument) => d.groups("now").map((g) => ({ name: g.name, heading: g.heading, tasks: g.entries.map((e) => e.task.text) }));

	it("keeps reading a list past ###", () => {
		const text = "## Now\n- [ ] A\n### Вечер\n- [ ] B\n#### note\n- [ ] C\n## Soon\n";
		const d = parseG(text);
		expect(d.tasks("now").map((e) => e.task.text)).toEqual(["A", "B", "C"]);
		expect(d.tasks("now").map((e) => e.group)).toEqual([null, "Вечер", "Вечер"]);
		expect(d.tasks("soon")).toHaveLength(0);
		expect(d.serialize()).toBe(text);
	});

	it("reads the ungrouped heading as null", () => {
		const d = parseG("## Now\n### Morning\n- [ ] A\n### No section\n- [ ] B\n");
		expect(shape(d)).toEqual([
			{ name: null, heading: false, tasks: [] },
			{ name: "Morning", heading: true, tasks: ["A"] },
			{ name: null, heading: true, tasks: ["B"] },
		]);
		expect(ungroupedIndex(d.groups("now"))).toBe(2);
		expect(d.tasks("now").map((e) => e.group)).toEqual(["Morning", null]);
	});

	it("reads every ### as a named group without an ungrouped name", () => {
		const d = TaskDocument.parse("## Now\n### No section\n- [ ] B\n", SECTIONS, M);
		expect(d.tasks("now")[0].group).toBe("No section");
	});

	it("trims heading names", () => {
		expect(parseG("## Now\n### Вечер  \n- [ ] A\n").tasks("now")[0].group).toBe("Вечер");
	});

	it("names are case-sensitive", () => {
		const d = parseG("## Now\n### Evening\n- [ ] A\n### evening\n- [ ] B\n");
		expect(d.groups("now").map((g) => g.name)).toEqual([null, "Evening", "evening"]);
	});

	it("a heading ends a task's children", () => {
		const d = parseG("## Now\n- [ ] A\n  - child\n### X\n- [ ] B\n");
		expect(d.tasks("now")[0].task.children).toEqual(["  - child"]);
		expect(d.tasks("now")[1].group).toBe("X");
	});

	it("inserts at start and end of the ungrouped group", () => {
		expect(parseG("## Now\n- [ ] A\n### X\n- [ ] B\n").insert("now", "end", task("N")).serialize()).toBe("## Now\n- [ ] A\n- [ ] N\n### X\n- [ ] B\n");
		expect(parseG("## Now\n- [ ] A\n### X\n- [ ] B\n").insert("now", "start", task("N")).serialize()).toBe("## Now\n- [ ] N\n- [ ] A\n### X\n- [ ] B\n");
		expect(parseG("## Now\n### X\n- [ ] B\n").insert("now", "end", task("N")).serialize()).toBe("## Now\n- [ ] N\n### X\n- [ ] B\n");
		expect(parseG("## Now\n### X\n- [ ] B\n### No section\n- [ ] C\n\n## Soon\n").insert("now", "end", task("N")).serialize()).toBe(
			"## Now\n### X\n- [ ] B\n### No section\n- [ ] C\n- [ ] N\n\n## Soon\n",
		);
		expect(parseG("## Now\n### X\n- [ ] B\n### No section\n- [ ] C\n").insert("now", "start", task("N")).serialize()).toBe(
			"## Now\n### X\n- [ ] B\n### No section\n- [ ] N\n- [ ] C\n",
		);
	});

	it("moves a task to the end of the ungrouped group, out of its group", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n");
		expect(d.moveEntry(d.tasks("now")[1], "now", "end").serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n### X\n");
	});

	it("inserts at the end of a group", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n### Y\n- [ ] C\n");
		expect(d.insert("now", { endOf: 1 }, task("N")).serialize()).toBe("## Now\n- [ ] A\n### X\n- [ ] B\n- [ ] N\n### Y\n- [ ] C\n");
		expect(parseG("## Now\n### X\n\n### Y\n").insert("now", { endOf: 1 }, task("N")).serialize()).toBe("## Now\n### X\n- [ ] N\n\n### Y\n");
	});

	it("a number inserts before that task, inside its group", () => {
		const d = parseG("## Now\n- [ ] A\n### X\n- [ ] B\n");
		expect(d.insert("now", 1, task("N")).serialize()).toBe("## Now\n- [ ] A\n### X\n- [ ] N\n- [ ] B\n");
	});

	it("marks a group with only blank lines as blank", () => {
		const d = parseG("## Now\n### X\n\n### Y\ntext\n### Z\n- [ ] A\n");
		expect(d.groups("now").map((g) => [g.name, g.blank])).toEqual([[null, true], ["X", true], ["Y", false], ["Z", false]]);
	});
});

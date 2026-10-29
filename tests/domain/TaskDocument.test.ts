import { describe, expect, it } from "vitest";
import type { Task } from "../../src/domain/Task";
import { TaskDocument } from "../../src/domain/TaskDocument";
import type { Markers } from "../../src/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { now: "Now", soon: "Soon", done: "Done" };
const ALL = ["Inbox", "Now", "Soon", "Backlog", "Done"];
const TEXT = `---\ntags: [todo]\n---\n# Список\n\n## Inbox\n- [ ] В инбоксе\n\n## Now\n- [ ] Первая\n- [/] Вторая ⏰ 2026-10-30 14:00-15:00\n  - заметка\n  - [ ] подпункт\n## Soon\n- [ ] Третья 📅 2026-11-03\nПросто текст\n\n## Backlog\n- [ ] Бэклог\n\n## Done\n- [x] Готово\n`;

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

function task(text: string, patch: Partial<Task> = {}): Task {
	return { status: "todo", statusChar: " ", text, dueDate: null, slot: null, children: [], ...patch };
}

describe("TaskDocument.parse", () => {
	it("round-trips byte for byte", () => {
		expect(parse(TEXT).serialize()).toBe(TEXT);
		expect(parse("").serialize()).toBe("");
		expect(parse("## Now\n- [ ] A").serialize()).toBe("## Now\n- [ ] A");
		expect(parse("## Now\r\n- [ ] A\r\n").serialize()).toBe("## Now\r\n- [ ] A\r\n");
	});

	it("reads tasks of the three sections only", () => {
		const d = parse(TEXT);
		expect(d.tasks("now").map((e) => e.task.text)).toEqual(["Первая", "Вторая"]);
		expect(d.tasks("now")[1].task.children).toEqual(["  - заметка", "  - [ ] подпункт"]);
		expect(d.tasks("soon").map((e) => e.task.text)).toEqual(["Третья"]);
		expect(d.tasks("done")).toHaveLength(1);
	});

	it("gives every entry its section, index and raw line", () => {
		const d = parse(TEXT);
		expect(d.tasks("now")[1]).toMatchObject({ section: "now", index: 1, raw: "- [/] Вторая ⏰ 2026-10-30 14:00-15:00", indent: "", bullet: "-" });
		expect(d.allTasks().map((e) => [e.section, e.index])).toEqual([["now", 0], ["now", 1], ["soon", 0], ["done", 0]]);
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

	it("ends a section at a heading of any level and matches the name after trim", () => {
		const d = parse("##  Now  \n- [ ] A\n# Top\n- [ ] not now\n## Soon\n- [ ] S\n### Sub\n- [ ] not soon\n");
		expect(d.tasks("now").map((e) => e.task.text)).toEqual(["A"]);
		expect(d.tasks("soon").map((e) => e.task.text)).toEqual(["S"]);
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

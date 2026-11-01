import { describe, expect, it } from "vitest";
import { descriptionMarkdown } from "../../src/domain/description";
import { DayBoundary } from "../../src/domain/DayBoundary";
import { createInPlace, placeTask, setDescription } from "../../src/domain/operations";
import { toItem } from "../../src/domain/queries";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };
const MIXED = [
	"## Now",
	"- [ ] Задача 1",
	"\t- Описание её",
	"\t- Ещё её описание",
	"\t- [ ] Задача 2 (подзадача)",
	"\t\t- Описание подзадачи",
	"\t- Снова описание задачи 1",
	"- [ ] Другая",
	"",
	"## Soon",
	"",
	"## Done",
	"",
].join("\n");

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

function nowLines(doc: TaskDocument): string[] {
	const text = doc.serialize();
	return text.slice(0, text.indexOf("\n\n## Soon")).split("\n").slice(1);
}

describe("a task's description", () => {
	const doc = parse(MIXED);
	const task = doc.tasks("now")[0];

	it("is the task's lines without a checkbox, in file order, wherever they stand among its subtasks", () => {
		expect(descriptionMarkdown(task)).toBe("- Описание её\n- Ещё её описание\n- Снова описание задачи 1");
	});

	it("leaves the lines under a subtask to the subtask", () => {
		expect(descriptionMarkdown(task.subtasks[0])).toBe("- Описание подзадачи");
	});

	it("is null for a task without such lines", () => {
		expect(descriptionMarkdown(doc.tasks("now")[1])).toBeNull();
	});

	it("keeps the depth of its nested lines below its first level", () => {
		const nested = parse("## Now\n- [ ] Trip\n\t- Багаж\n\t\t- чемодан\n\t\t\t> цитата\n");
		expect(descriptionMarkdown(nested.tasks("now")[0])).toBe("- Багаж\n\t- чемодан\n\t\t> цитата");
	});

	it("reaches the item the view gets", () => {
		expect(toItem(task).description).toBe("- Описание её\n- Ещё её описание\n- Снова описание задачи 1");
		expect(toItem(task).subtasks[0].description).toBe("- Описание подзадачи");
		expect(toItem(doc.tasks("now")[1]).description).toBeNull();
	});

	it("is written as one block right under the task, before its subtasks, which keep their own lines", () => {
		expect(nowLines(setDescription(doc, task, "- Новое\n\t- глубже"))).toEqual([
			"- [ ] Задача 1",
			"\t- Новое",
			"\t\t- глубже",
			"\t- [ ] Задача 2 (подзадача)",
			"\t\t- Описание подзадачи",
			"- [ ] Другая",
		]);
	});

	it("changes nothing when it is saved as it was", () => {
		expect(setDescription(doc, task, "- Описание её\n- Ещё её описание\n- Снова описание задачи 1")).toBe(doc);
		expect(setDescription(doc, doc.tasks("now")[1], "  \n")).toBe(doc);
	});

	it("goes away when emptied, leaving the subtasks", () => {
		for (const empty of ["", "\n  \n"]) {
			expect(nowLines(setDescription(doc, task, empty))).toEqual(["- [ ] Задача 1", "\t- [ ] Задача 2 (подзадача)", "\t\t- Описание подзадачи", "- [ ] Другая"]);
		}
	});

	it("drops blank lines, which would end the task in the file", () => {
		expect(nowLines(setDescription(doc, doc.tasks("now")[1], "- a\n\n- b\n"))).toContain("\t- b");
		expect(nowLines(setDescription(doc, doc.tasks("now")[1], "- a\n\n- b\n")).slice(-3)).toEqual(["- [ ] Другая", "\t- a", "\t- b"]);
	});

	it("takes the indent of the task's subtasks, else the file's step, else a tab", () => {
		const spaces = parse("## Now\n- [ ] A\n    - [ ] sub\n- [ ] B\n\n## Soon\n\n## Done\n");
		expect(nowLines(setDescription(spaces, spaces.tasks("now")[1], "- x"))).toEqual(["- [ ] A", "    - [ ] sub", "- [ ] B", "    - x"]);
		const flat = parse("## Now\n- [ ] B\n\n## Soon\n\n## Done\n");
		expect(nowLines(setDescription(flat, flat.tasks("now")[0], "- x"))).toEqual(["- [ ] B", "\t- x"]);
	});

	it("keeps a task line nested under a description line as a subtask when the description changes", () => {
		const odd = parse("## Now\n- [ ] A\n\t- note\n\t\t- [ ] deep\n\t\t\tits line\n\n## Soon\n\n## Done\n");
		const a = odd.tasks("now")[0];
		expect(descriptionMarkdown(a)).toBe("- note");
		expect(nowLines(setDescription(odd, a, "- other"))).toEqual(["- [ ] A", "\t- other", "\t\t- [ ] deep", "\t\t\tits line"]);
	});
});

describe("a description and the tasks typed in place", () => {
	const TODAY = "2026-11-01";
	const doc = parse(MIXED);
	const [first, other] = doc.tasks("now");
	const inNow = (before: typeof first | null) => ({ kind: "list", list: "now", group: null, before, date: null }) as const;

	it("a new task right before a task with a description goes above its line, the description staying under it", () => {
		const lines = nowLines(createInPlace(doc, "X", null, inNow(first), TODAY, DayBoundary.MIDNIGHT));
		expect(lines).toEqual(["- [ ] X 📅 2026-11-01", ...MIXED.split("\n").slice(1, 8)]);
	});

	it("a new task right after a task with a description goes under the whole description", () => {
		const lines = nowLines(createInPlace(doc, "X", null, inNow(other), TODAY, DayBoundary.MIDNIGHT));
		expect(lines).toEqual([...MIXED.split("\n").slice(1, 7), "- [ ] X 📅 2026-11-01", "- [ ] Другая"]);
	});

	it("a new subtask right before a subtask with a description leaves both descriptions where they were", () => {
		const place = { kind: "subtask", parent: first, before: first.subtasks[0] } as const;
		const created = createInPlace(doc, "X", null, place, TODAY, DayBoundary.MIDNIGHT);
		expect(nowLines(created)).toEqual(["- [ ] Задача 1", "\t- Описание её", "\t- Ещё её описание", "\t- [ ] X", "\t- [ ] Задача 2 (подзадача)", "\t\t- Описание подзадачи", "\t- Снова описание задачи 1", "- [ ] Другая"]);
		expect(descriptionMarkdown(created.tasks("now")[0])).toBe(descriptionMarkdown(first));
		expect(descriptionMarkdown(created.tasks("now")[0].subtasks[1])).toBe("- Описание подзадачи");
	});

	it("a new last subtask leaves the description with its task", () => {
		const created = createInPlace(doc, "X", null, { kind: "subtask", parent: first, before: null }, TODAY, DayBoundary.MIDNIGHT);
		expect(descriptionMarkdown(created.tasks("now")[0])).toBe(descriptionMarkdown(first));
		expect(created.tasks("now")[0].subtasks.map((s) => s.task.text)).toEqual(["Задача 2 (подзадача)", "X"]);
	});

	it("a rename in place keeps the task's description and subtasks", () => {
		const renamed = placeTask(doc, first, { text: "Новое имя", placement: { kind: "soon" }, priority: null }, TODAY);
		const moved = renamed.tasks("soon")[0];
		expect(moved.task.text).toBe("Новое имя");
		expect(descriptionMarkdown(moved)).toBe(descriptionMarkdown(first));
		expect(moved.subtasks.map((s) => s.task.text)).toEqual(["Задача 2 (подзадача)"]);
		const same = placeTask(doc, first, { text: "Новое имя", placement: { kind: "now" }, priority: null }, TODAY);
		expect(descriptionMarkdown(same.tasks("now")[0])).toBe(descriptionMarkdown(first));
	});
});

import { describe, expect, it } from "vitest";
import { DayBoundary } from "../../core/domain/DayBoundary";
import { normalize } from "../../core/domain/normalize";
import { createInPlace, moveToGroup, moveToList, nest, newTask, removeGroupIn, rename, renameGroupIn, setProject, setSlot, setStatus } from "../../core/domain/operations";
import { projectName, projectOfText } from "../../core/domain/Project";
import { TaskDocument } from "../../core/domain/TaskDocument";
import { formatTaskLine, parseTaskLine, type Markers } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", repeat: "🔁", collapsed: "📁", labelTag: "label", labels: ["Важное"], priorities: ["p1"] };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };
const T = "2026-11-07";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("the project field", () => {
	it("is read off the line: the title never holds it", () => {
		const p = parseTaskLine("- [ ] Сходить на языковой обмен 🗂️ [[Окружение в новой стране]] 📅 2026-11-12", M)!;
		expect(p.task).toMatchObject({ text: "Сходить на языковой обмен", project: "Окружение в новой стране", dueDate: "2026-11-12" });
	});

	it("is read with or without the emoji's variation selector, and anywhere on the line", () => {
		expect(parseTaskLine("- [ ] A \u{1F5C2} [[P]]", M)!.task).toMatchObject({ text: "A", project: "P" });
		expect(parseTaskLine("- [ ] A 🗂️ [[P]] B", M)!.task).toMatchObject({ text: "A B", project: "P" });
		expect(parseTaskLine("- [ ] A 📅 2026-11-12 🗂️ [[P]] ⏰ 2026-11-12 10:00", M)!.task).toMatchObject({ text: "A", project: "P", dueDate: "2026-11-12", slot: { start: 600 } });
	});

	it("keeps a path and drops an alias or a heading of the link", () => {
		expect(parseTaskLine("- [ ] A 🗂️ [[Проекты/Друзья|друзья]]", M)!.task.project).toBe("Проекты/Друзья");
		expect(projectName("Проекты/Друзья")).toBe("Друзья");
		expect(projectName("Друзья.md")).toBe("Друзья");
		expect(projectOfText("A 🗂️ [[P#Цели]]")).toEqual({ project: "P", text: "A" });
	});

	it("leaves a plain link and a lone marker in the text", () => {
		expect(parseTaskLine("- [ ] Прочитать [[Книга]]", M)!.task).toMatchObject({ text: "Прочитать [[Книга]]", project: null });
		expect(parseTaskLine("- [ ] A 🗂️ B", M)!.task).toMatchObject({ text: "A 🗂️ B", project: null });
	});

	it("is written after the labels, before the fold marker and the other fields", () => {
		const p = parseTaskLine("- [ ] A 📁 🗂️ [[P]] #label/Важное 🔁 every day 📅 2026-11-12 ⏰ 2026-11-12 10:00", M)!;
		expect(formatTaskLine(p, M)).toBe("- [ ] A #label/Важное 🗂️ [[P]] 📁 📅 2026-11-12 ⏰ 2026-11-12 10:00 🔁 every day");
	});

	it("a task without one writes none", () => {
		expect(formatTaskLine({ indent: "", bullet: "-", task: newTask("A") }, M)).toBe("- [ ] A");
		expect(formatTaskLine({ indent: "", bullet: "-", task: newTask("A", { project: "P" }) }, M)).toBe("- [ ] A 🗂️ [[P]]");
	});
});

describe("a task's project in the document", () => {
	it("a subtask's is its parent's, whatever its own line says", () => {
		const doc = parse("## Backlog\n- [ ] A 🗂️ [[P]]\n\t- [ ] B 🗂️ [[Q]]\n\t\t- [ ] C\n- [ ] D\n");
		const [a, d] = doc.tasks("backlog");
		expect(a.project).toBe("P");
		expect(a.subtasks[0].project).toBe("P");
		expect(a.subtasks[0].subtasks[0].project).toBe("P");
		expect(d.project).toBeNull();
	});

	it("a subtask leaving its parent takes the parent's project onto its line", () => {
		const doc = parse("## Now\n- [ ] A 🗂️ [[P]]\n\t- [ ] B\n\n## Soon\n");
		const sub = doc.tasks("now")[0].subtasks[0];
		const moved = moveToList(doc, sub, "2026-11-09", T);
		expect(moved.serialize()).toContain("- [ ] B 🗂️ [[P]] 📅 2026-11-09");
		const slotted = setSlot(doc, sub, { date: T, start: 600, end: null }, T);
		expect(slotted.serialize()).toContain("- [ ] B 🗂️ [[P]] ⏰ 2026-11-07 10:00");
	});

	it("a task nested under another loses its own: the parent's is its project", () => {
		const doc = parse("## Backlog\n- [ ] A 🗂️ [[P]]\n- [ ] B 🗂️ [[Q]]\n");
		const [a, b] = doc.tasks("backlog");
		expect(nest(doc, b, a, null).serialize()).toBe("## Backlog\n- [ ] A 🗂️ [[P]]\n\t- [ ] B\n");
	});

	it("a repeating subtask's copy, a task of its own, gets the parent's project", () => {
		const doc = parse("## Now\n- [ ] A 🗂️ [[P]]\n\t- [ ] B 🔁 every day 📅 2026-11-07\n\n## Soon\n\n## Done\n");
		const done = setStatus(doc, doc.tasks("now")[0].subtasks[0], "done");
		expect(normalize(done, T, DayBoundary.MIDNIGHT).serialize()).toContain("## Soon\n\n- [ ] B 🗂️ [[P]] 📅 2026-11-08 🔁 every day");
	});

	it("rename, status and a move keep it", () => {
		const doc = parse("## Backlog\n- [ ] A 🗂️ [[P]]\n\n## Now\n");
		const entry = doc.tasks("backlog")[0];
		expect(rename(doc, entry, "B").serialize()).toContain("- [ ] B 🗂️ [[P]]");
		expect(setStatus(doc, entry, "inProgress").serialize()).toContain("- [/] A 🗂️ [[P]]");
		expect(moveToGroup(doc, entry, "now", null, null, T).serialize()).toContain("## Now\n- [ ] A 🗂️ [[P]] 📅 2026-11-07");
	});

	it("setProject writes the field, null takes it off; a subtask's line is left alone", () => {
		const doc = parse("## Backlog\n- [ ] A\n\t- [ ] B\n");
		const a = doc.tasks("backlog")[0];
		const set = setProject(doc, a, "Окружение");
		expect(set.serialize()).toBe("## Backlog\n- [ ] A 🗂️ [[Окружение]]\n\t- [ ] B\n");
		expect(setProject(set, set.tasks("backlog")[0], null).serialize()).toBe("## Backlog\n- [ ] A\n\t- [ ] B\n");
		expect(setProject(doc, a.subtasks[0], "Q")).toBe(doc);
	});
});

describe("moves in a list grouped by project", () => {
	const FILE = "## Backlog\n- [ ] A 🗂️ [[P]]\n- [ ] B\n- [ ] C 🗂️ [[P]]\n- [ ] D\n### Дальний\n- [ ] E\n- [ ] F 🗂️ [[P]]\n- [ ] G\n\n## Now\n- [ ] N\n";

	it("into a project's group with no task to stand before: right after that project's last task there", () => {
		const doc = parse(FILE);
		const n = doc.tasks("now")[0];
		expect(moveToGroup(doc, n, "backlog", null, null, T, null, "P").serialize()).toBe(
			"## Backlog\n- [ ] A 🗂️ [[P]]\n- [ ] B\n- [ ] C 🗂️ [[P]]\n- [ ] N 🗂️ [[P]]\n- [ ] D\n### Дальний\n- [ ] E\n- [ ] F 🗂️ [[P]]\n- [ ] G\n\n## Now\n",
		);
	});

	it("into a section the project has nothing in: its end; into No project: the field goes", () => {
		const doc = parse(FILE);
		const a = doc.tasks("backlog")[0];
		expect(moveToGroup(doc, a, "backlog", "Дальний", null, T, null, "Q").serialize()).toContain("- [ ] G\n- [ ] A 🗂️ [[Q]]\n");
		expect(moveToGroup(doc, a, "backlog", "Дальний", null, T, null, null).serialize()).toContain("- [ ] E\n- [ ] F 🗂️ [[P]]\n- [ ] G\n- [ ] A\n");
	});

	it("before a task shown: right before it, the project changed", () => {
		const doc = parse(FILE);
		const [, b, , d] = doc.tasks("backlog");
		expect(moveToGroup(doc, d, "backlog", null, b, T, null, "P").serialize()).toContain("- [ ] A 🗂️ [[P]]\n- [ ] D 🗂️ [[P]]\n- [ ] B\n");
	});

	it("a subtask dropped into another project's group is a task of that project", () => {
		const doc = parse("## Backlog\n- [ ] A 🗂️ [[P]]\n\t- [ ] S\n- [ ] B 🗂️ [[Q]]\n");
		const s = doc.tasks("backlog")[0].subtasks[0];
		expect(moveToGroup(doc, s, "backlog", null, null, T, null, "Q").serialize()).toBe("## Backlog\n- [ ] A 🗂️ [[P]]\n- [ ] B 🗂️ [[Q]]\n- [ ] S 🗂️ [[Q]]\n");
	});

	it("a new task in a project's group: after its last task, with its field", () => {
		const doc = parse(FILE);
		const made = createInPlace(doc, "New", null, { kind: "list", list: "backlog", group: "Дальний", before: null, date: null, project: "P" }, T, DayBoundary.MIDNIGHT);
		expect(made.serialize()).toContain("- [ ] F 🗂️ [[P]]\n- [ ] New 🗂️ [[P]]\n- [ ] G\n");
	});

	it("a new task with its new section: the heading right after the group the field stood in, the task under it", () => {
		const doc = parse(FILE);
		const made = createInPlace(doc, "New", null, { kind: "list", list: "backlog", group: null, before: null, date: null, project: "P", section: "Идеи" }, T, DayBoundary.MIDNIGHT);
		expect(made.serialize()).toBe("## Backlog\n- [ ] A 🗂️ [[P]]\n- [ ] B\n- [ ] C 🗂️ [[P]]\n- [ ] D\n### Идеи\n- [ ] New 🗂️ [[P]]\n### Дальний\n- [ ] E\n- [ ] F 🗂️ [[P]]\n- [ ] G\n\n## Now\n- [ ] N\n");
		const into = createInPlace(doc, "New", null, { kind: "list", list: "backlog", group: null, before: null, date: null, project: "P", section: "Дальний" }, T, DayBoundary.MIDNIGHT);
		expect(into.serialize()).toContain("- [ ] F 🗂️ [[P]]\n- [ ] New 🗂️ [[P]]\n- [ ] G\n");
	});

	it("a slot written in a project's view gets its field", () => {
		const made = createInPlace(parse("## Now\n\n## Soon\n"), "New", null, { kind: "slot", slot: { date: T, start: 600, end: null }, project: "P" }, T, DayBoundary.MIDNIGHT);
		expect(made.serialize()).toContain("- [ ] New 🗂️ [[P]] ⏰ 2026-11-07 10:00");
	});
});

describe("section actions of one project's part", () => {
	const FILE = "## Backlog\n- [ ] X\n### Дальний\n- [ ] E\n- [ ] F 🗂️ [[P]]\n- [ ] G 🗂️ [[P]]\n### Потом\n- [ ] H\n";

	it("a new name: its heading where the old one stood, the project's tasks under it; the others keep theirs", () => {
		expect(renameGroupIn(parse(FILE), "backlog", "Дальний", "Скоро", "No section", "P").serialize()).toBe(
			"## Backlog\n- [ ] X\n### Скоро\n- [ ] F 🗂️ [[P]]\n- [ ] G 🗂️ [[P]]\n### Дальний\n- [ ] E\n### Потом\n- [ ] H\n",
		);
	});

	it("a name the list has: the tasks join its end; the old section left empty goes", () => {
		const doc = parse("## Backlog\n### Дальний\n- [ ] F 🗂️ [[P]]\n### Потом\n- [ ] H\n");
		expect(renameGroupIn(doc, "backlog", "Дальний", "Потом", "No section", "P").serialize()).toBe("## Backlog\n### Потом\n- [ ] H\n- [ ] F 🗂️ [[P]]\n");
	});

	it("removing it takes only the project's tasks out, to the end of No section", () => {
		expect(removeGroupIn(parse(FILE), "backlog", "Дальний", "P").serialize()).toBe("## Backlog\n- [ ] X\n- [ ] F 🗂️ [[P]]\n- [ ] G 🗂️ [[P]]\n### Дальний\n- [ ] E\n### Потом\n- [ ] H\n");
		expect(removeGroupIn(parse(FILE), "backlog", "Дальний", null).serialize()).toBe("## Backlog\n- [ ] X\n- [ ] E\n### Дальний\n- [ ] F 🗂️ [[P]]\n- [ ] G 🗂️ [[P]]\n### Потом\n- [ ] H\n");
	});
});

describe("cutting the field out", () => {
	it("keeps the text's own spacing: only the seam of the field goes", () => {
		expect(parseTaskLine("- [ ] T1  two  spaces 🗂️ [[P]]", M)!.task).toMatchObject({ text: "T1  two  spaces", project: "P" });
		expect(projectOfText("A  B 🗂️ [[P]] C")).toEqual({ project: "P", text: "A  B C" });
		expect(projectOfText("🗂️ [[P]] A")).toEqual({ project: "P", text: "A" });
	});
});

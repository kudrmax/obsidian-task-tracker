import { describe, expect, it } from "vitest";
import { cleanProjectName } from "../../core/domain/Project";
import { FOLDER_MARK, readTree, treeLines } from "../../core/domain/ProjectTree";
import { deleteProject, hasOwnTasks, moveProject, renameProject, setProjectFolder, withTasksInTree } from "../../core/domain/ProjectWrites";
import { TaskDocument } from "../../core/domain/TaskDocument";
import type { Markers } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", collapsed: "📁" };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };
const parse = (text: string) => TaskDocument.parse(text, SECTIONS, M);

const FILE = [
	"## Inbox",
	"",
	"- [ ] Voice 🗂️ Отчёты",
	"",
	"## Projects",
	"",
	"- Работа 🗃️",
	"\t- Отчёты",
	"\t- Найм [[Найм]]",
	"- Дружба [[Моя заметка о дружбе]]",
	"\t- Small talk",
	"",
	"## Now",
	"",
	"- [ ] Call 🗂️ Дружба",
	"\t- [ ] Step 🗂️ Small talk",
	"",
	"## Done",
	"",
	"- [x] Old 🗂️ Small talk",
	"",
].join("\n");

const folders = (doc: TaskDocument) => doc.projectTree().all().filter((p) => p.node.folder).map((p) => p.node.name);

describe("a folder in ## Projects", () => {
	it("is the mark 🗃️ as a word of its line: read off the name, the note's link kept", () => {
		expect(FOLDER_MARK).toBe("🗃️");
		const tree = readTree(["## Projects", "- Работа 🗃️", "\t- Отчёты", "- 🗃 Дом [[Дом]]", "- Дача [[Дача]] 🗃️", "- Спорт"]);
		expect(tree.all().map((p) => [p.node.name, p.node.note, p.node.folder])).toEqual([
			["Работа", null, true],
			["Отчёты", null, false],
			["Дом", "Дом", true],
			["Дача", "Дача", true],
			["Спорт", null, false],
		]);
	});

	it("is read only outside the note's link, and leaves the name's own spaces as typed", () => {
		const tree = readTree(["## Projects", "- Работа [[Мои 🗃️ заметки]]", "- Box  two 🗃️", "- A 🗃️ B"]);
		expect(tree.all().map((p) => [p.node.name, p.node.note, p.node.folder])).toEqual([
			["Работа", "Мои 🗃️ заметки", false],
			["Box  two", null, true],
			["A B", null, true],
		]);
		expect(treeLines(tree, "\t")).toEqual(["- Работа [[Мои 🗃️ заметки]]", "- Box  two 🗃️", "- A B 🗃️"]);
		const doc = parse("## Inbox\n\n- [ ] T 🗂️ Box  two\n\n## Projects\n\n- Box  two 🗃️\n");
		expect(withTasksInTree(doc)).toBe(doc);
	});

	it("is written right after the name, before the note's link", () => {
		const tree = readTree(["## Projects", "- 🗃️ Работа", "\t- Отчёты", "- Дача [[Дача]] 🗃️"]);
		expect(treeLines(tree, "\t")).toEqual(["- Работа 🗃️", "\t- Отчёты", "- Дача 🗃️ [[Дача]]"]);
	});

	it("leaves a file written as the core writes it byte for byte", () => {
		const doc = parse(FILE);
		expect(doc.withProjectTree(doc.projectTree())).toBe(doc);
		expect(withTasksInTree(doc)).toBe(doc);
	});

	it("is never part of a name: a typed name loses the mark", () => {
		expect(cleanProjectName("Работа 🗃️")).toBe("Работа");
		expect(cleanProjectName("🗃")).toBeNull();
	});

	it("a name met again joins the first: a folder either way", () => {
		expect(readTree(["## Projects", "- A", "- a 🗃️"]).find("A")!.node.folder).toBe(true);
	});
});

describe("a project made a folder", () => {
	it("is marked on its line; turned off, the mark goes; one write each", () => {
		const doc = parse(FILE);
		const on = setProjectFolder(doc, "Дружба", true);
		expect(on).toBe(doc);
		const off = setProjectFolder(doc, "Работа", false);
		expect(off.serialize()).toBe(FILE.replace("- Работа 🗃️", "- Работа"));
		expect(setProjectFolder(off, "работа", true).serialize()).toBe(FILE);
	});

	it("only without tasks of its own, open or done; its subprojects' tasks and a subtask's 🗂️ don't count", () => {
		const doc = parse(FILE);
		expect(hasOwnTasks(doc, "Дружба")).toBe(true);
		expect(hasOwnTasks(doc, "Small talk")).toBe(true);
		expect(hasOwnTasks(doc, "Работа")).toBe(false);
		expect(hasOwnTasks(doc, "Найм")).toBe(false);
		const withSubtaskOnly = parse(FILE.replace("- [x] Old 🗂️ Small talk", "- [x] Old"));
		expect(hasOwnTasks(withSubtaskOnly, "Small talk")).toBe(false);
		expect(folders(setProjectFolder(withSubtaskOnly, "Small talk", true))).toEqual(["Работа", "Small talk"]);
		expect(setProjectFolder(doc, "Small talk", true)).toBe(doc);
	});

	it("a name the tree lacks, or the state it has: nothing", () => {
		const doc = parse(FILE);
		expect(setProjectFolder(doc, "Нет такого", true)).toBe(doc);
		expect(setProjectFolder(doc, "Работа", true)).toBe(doc);
		expect(setProjectFolder(doc, "Найм", false)).toBe(doc);
	});

	it("stays a folder through rename, move and nesting; its subprojects lifted on delete keep theirs", () => {
		const doc = parse(FILE);
		expect(folders(renameProject(doc, "Работа", "Job"))).toEqual(["Job"]);
		expect(folders(moveProject(doc, "Работа", { parent: "Дружба", before: null }))).toEqual(["Работа"]);
		expect(moveProject(doc, "Работа", { parent: null, before: null }).serialize()).toContain("\t- Small talk\n- Работа 🗃️\n\t- Отчёты\n\t- Найм [[Найм]]\n");
		const nested = setProjectFolder(parse(FILE.replace("\t- Найм [[Найм]]", "\t- Найм 🗃️ [[Найм]]")), "Работа", false);
		expect(folders(deleteProject(nested, "Работа"))).toEqual(["Найм"]);
		expect(deleteProject(nested, "Работа").serialize()).toContain("- Отчёты\n- Найм 🗃️ [[Найм]]\n- Дружба");
	});

	it("a task that names a folder by hand is read as it is, and the folder stays one", () => {
		const doc = parse(FILE.replace("- [ ] Voice 🗂️ Отчёты", "- [ ] Voice 🗂️ Работа"));
		expect(doc.tasks("inbox")[0].task.projects).toEqual(["Работа"]);
		expect(withTasksInTree(doc)).toBe(doc);
		expect(folders(doc)).toEqual(["Работа"]);
		expect(hasOwnTasks(doc, "Работа")).toBe(true);
	});
});

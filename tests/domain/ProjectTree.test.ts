import { describe, expect, it } from "vitest";
import { ProjectTree, readTree } from "../../core/domain/ProjectTree";
import { TaskDocument } from "../../core/domain/TaskDocument";
import type { Markers } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", collapsed: "📁" };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };
const parse = (text: string) => TaskDocument.parse(text, SECTIONS, M);

const FILE = [
	"## Inbox",
	"",
	"- [ ] Voice",
	"",
	"## Projects",
	"",
	"- Окружение в Сербии",
	"  - Где знакомиться",
	"    - Приложения для знакомств",
	"  - Свидание",
	"- Дружба [[Моя заметка о дружбе]]",
	"\t- Small talk",
	"",
	"## Now",
	"",
	"- [ ] Call",
	"",
].join("\n");

const names = (tree: ProjectTree) => tree.all().map((p) => p.path.join(" › ") + (p.node.note ? ` [${p.node.note}]` : ""));

describe("## Projects", () => {
	it("is a nested list of names: indent (two spaces or a tab) is nesting, order the manual order, a note's link after a name", () => {
		expect(names(parse(FILE).projectTree())).toEqual([
			"Окружение в Сербии",
			"Окружение в Сербии › Где знакомиться",
			"Окружение в Сербии › Где знакомиться › Приложения для знакомств",
			"Окружение в Сербии › Свидание",
			"Дружба [Моя заметка о дружбе]",
			"Дружба › Small talk",
		]);
	});

	it("is no task list: the sections around it read as they did, Inbox ending at its heading", () => {
		const doc = parse(FILE);
		expect(doc.tasks("inbox").map((e) => e.task.text)).toEqual(["Voice"]);
		expect(doc.tasks("now").map((e) => e.task.text)).toEqual(["Call"]);
	});

	it("takes a name met again as the first one, its subprojects joining it", () => {
		const tree = readTree(["## Projects", "- A", "- a", "\t- B"]);
		expect(names(tree)).toEqual(["A", "A › B"]);
	});

	it("is written back in place, every other line of the file where it was; the same tree changes nothing", () => {
		const doc = parse(FILE);
		expect(doc.withProjectTree(doc.projectTree())).toBe(doc);
		const moved = doc.withProjectTree(doc.projectTree().moved("Дружба", { parent: null, before: "Окружение в Сербии" }));
		expect(moved.serialize()).toBe(FILE.replace("- Окружение в Сербии\n  - Где знакомиться\n    - Приложения для знакомств\n  - Свидание\n- Дружба [[Моя заметка о дружбе]]\n\t- Small talk", "- Дружба [[Моя заметка о дружбе]]\n  - Small talk\n- Окружение в Сербии\n  - Где знакомиться\n    - Приложения для знакомств\n  - Свидание"));
	});

	it("is made right after Inbox when the file has none, apart by blank lines", () => {
		const doc = parse("## Inbox\n\n- [ ] Voice\n\n## Now\n\n- [ ] Call\n");
		const made = doc.withProjectTree(ProjectTree.EMPTY.added("Спорт", { parent: null, before: null }));
		expect(made.serialize()).toBe("## Inbox\n\n- [ ] Voice\n\n## Projects\n\n- Спорт\n\n## Now\n\n- [ ] Call\n");
		expect(made.tasks("inbox")).toHaveLength(1);
	});
});

describe("the tree's changes", () => {
	const tree = parse(FILE).projectTree();

	it("add a project at a place, never a name it has", () => {
		expect(names(tree.added("Мероприятия", { parent: "Окружение в Сербии", before: "Свидание" })).slice(0, 5)).toEqual([
			"Окружение в Сербии",
			"Окружение в Сербии › Где знакомиться",
			"Окружение в Сербии › Где знакомиться › Приложения для знакомств",
			"Окружение в Сербии › Мероприятия",
			"Окружение в Сербии › Свидание",
		]);
		expect(tree.added("дружба", { parent: null, before: null })).toBe(tree);
		expect(tree.added("X", { parent: "Нет такого", before: null })).toBe(tree);
	});

	it("move a project with its branch, never into itself", () => {
		expect(names(tree.moved("Где знакомиться", { parent: "Дружба", before: null })).slice(-3)).toEqual(["Дружба › Small talk", "Дружба › Где знакомиться", "Дружба › Где знакомиться › Приложения для знакомств"]);
		expect(tree.moved("Окружение в Сербии", { parent: "Приложения для знакомств", before: null })).toBe(tree);
	});

	it("rename one, never to a name another has; attach and detach a note", () => {
		expect(tree.renamed("Свидание", "Свидания").find("Свидания")!.path).toEqual(["Окружение в Сербии", "Свидания"]);
		expect(tree.renamed("Свидание", "дружба")).toBe(tree);
		expect(tree.withNote("Спорт", "x")).toBe(tree);
		expect(tree.withNote("Свидание", "Заметки/Свидание").find("Свидание")!.node.note).toBe("Заметки/Свидание");
		expect(tree.withNote("Дружба", null).find("Дружба")!.node.note).toBeNull();
	});

	it("put each name it lacks last at the top", () => {
		expect(names(tree.withMissing(["Дружба", "Спорт"])).slice(-1)[0]).toBe("Спорт");
	});
});

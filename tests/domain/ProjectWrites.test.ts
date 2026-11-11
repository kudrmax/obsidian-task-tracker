import { describe, expect, it } from "vitest";
import { movedToProjects, renameProject, withTasksInTree } from "../../core/domain/ProjectWrites";
import { TaskDocument } from "../../core/domain/TaskDocument";
import type { Markers } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", collapsed: "📁", priorities: ["p1"], labelTag: "label", labels: ["Fast"] };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };
const parse = (text: string) => TaskDocument.parse(text, SECTIONS, M);

/** Max's file before the move, as 0.4.189 wrote it. */
const BEFORE = [
	"## Inbox",
	"",
	"- [ ] Свидание: в каком формате искать 🗂️ [[Окружение в Сербии]]",
	"",
	"## Now",
	"",
	"- [ ] 🎯 p1 МТС #label/Fast 🗂️ [[Дела]] 📁",
	"\t- [ ] Позвонить",
	"",
	"## Soon",
	"",
	"- [ ] 🎯 iPhone",
	"\t- [ ] Составить план 🗂️ [[Старое]]",
	"- [ ] Без проекта",
	"",
	"## Backlog",
	"",
	"- [ ] Активности 🗂️ [[Заметки/Окружение в Сербии|окружение]]",
	"",
	"## Done",
	"",
].join("\n");

const NOTES = [
	{ name: "Окружение в Сербии", link: "Окружение в Сербии" },
	{ name: "Дружба", link: "Заметки/Дружба" },
];

describe("the one move to projects", () => {
	const moved = movedToProjects(parse(BEFORE), NOTES).serialize();

	it("makes each note that was a project a top-level project with its note attached, by name, then each name a task gives without a note", () => {
		expect(moved).toContain("## Projects\n\n- Дружба [[Заметки/Дружба]]\n- Окружение в Сербии [[Окружение в Сербии]]\n- Дела\n\n## Now");
	});

	it("rewrites the tasks' fields plain, labels after them; a subtask's own field too", () => {
		expect(moved).toContain("- [ ] Свидание: в каком формате искать 🗂️ Окружение в Сербии\n");
		expect(moved).toContain("- [ ] Активности 🗂️ Окружение в Сербии\n");
		expect(moved).toContain("\t- [ ] Составить план 🗂️ Старое\n");
	});

	it("takes the result mark off every line, the priority after it kept as the priority", () => {
		expect(moved).toContain("- [ ] p1 МТС 🗂️ Дела #label/Fast 📁\n\t- [ ] Позвонить\n");
		expect(moved).toContain("- [ ] iPhone\n");
		expect(moved).not.toContain("🎯");
	});

	it("runs once: a file with ## Projects is left as it is", () => {
		const done = movedToProjects(parse(BEFORE), NOTES);
		expect(movedToProjects(done, [{ name: "Новое", link: "Новое" }])).toBe(done);
	});

	it("leaves a file with nothing to move as it is", () => {
		const plain = parse("## Inbox\n\n- [ ] A\n");
		expect(movedToProjects(plain, [])).toBe(plain);
	});
});

describe("the tasks' projects in the tree", () => {
	it("are written into it on a write: one the tree lacks goes last at the top", () => {
		const doc = parse("## Inbox\n\n- [ ] A 🗂️ Спорт\n\n## Projects\n\n- Дружба\n\n## Now\n");
		expect(withTasksInTree(doc).serialize()).toBe("## Inbox\n\n- [ ] A 🗂️ Спорт\n\n## Projects\n\n- Дружба\n- Спорт\n\n## Now\n");
	});

	it("leave a file whose tasks name none as it is", () => {
		const doc = parse("## Inbox\n\n- [ ] A\n");
		expect(withTasksInTree(doc)).toBe(doc);
	});
});

describe("a project renamed", () => {
	const doc = parse("## Inbox\n\n- [ ] A 🗂️ Дружба 🗂️ Спорт\n\t- [ ] B 🗂️ дружба\n\n## Projects\n\n- Дружба [[Заметка]]\n\t- Small talk\n- Спорт\n");

	it("is renamed in the tree and in every task's field, the note kept", () => {
		expect(renameProject(doc, "Дружба", "Друзья").serialize()).toBe("## Inbox\n\n- [ ] A 🗂️ Друзья 🗂️ Спорт\n\t- [ ] B 🗂️ Друзья\n\n## Projects\n\n- Друзья [[Заметка]]\n\t- Small talk\n- Спорт\n");
	});

	it("to a name another project has, writes nothing", () => {
		expect(renameProject(doc, "Дружба", "спорт")).toBe(doc);
	});
});

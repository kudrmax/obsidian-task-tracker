import { describe, expect, it } from "vitest";
import { newTask } from "../../core/domain/operations";
import { cleanProjectName, projectsOfText } from "../../core/domain/Project";
import { TaskDocument } from "../../core/domain/TaskDocument";
import { formatTaskLine, parseTaskLine, type Markers } from "../../core/domain/TaskLine";

const M: Markers = { dueDate: "📅", slot: "⏰", alarmSlot: "🚨", repeat: "🔁", collapsed: "📁", labelTag: "label", labels: ["Важное"], priorities: ["p1"] };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done", ungrouped: "No section" };

describe("a task's projects on its line", () => {
	it("are plain names, one 🗂️ each, running to the next field's mark", () => {
		const p = parseTaskLine("- [ ] Small talk 🗂️ Дружба 🗂️ Small talk 📁 📅 2026-11-12", M)!;
		expect(p.task).toMatchObject({ text: "Small talk", projects: ["Дружба", "Small talk"], collapsed: true, dueDate: "2026-11-12" });
	});

	it("end at a tag and at the line's end, the name's own spaces kept", () => {
		expect(parseTaskLine("- [ ] A 🗂️ Окружение в Сербии #label/Важное", M)!.task).toMatchObject({ text: "A", projects: ["Окружение в Сербии"], labels: ["Важное"] });
		expect(parseTaskLine("- [ ] A 🗂️ Стиль, внешность", M)!.task.projects).toEqual(["Стиль, внешность"]);
		expect(parseTaskLine("- [ ] A 🗂️ X 🚨 2026-11-12 10:00", M)!.task).toMatchObject({ projects: ["X"], slot: { start: 600 } });
	});

	it("read the old link as the note's name, with or without the variation selector, and leave what follows as text", () => {
		expect(parseTaskLine("- [ ] A \u{1F5C2} [[Проекты/Друзья|друзья]] B", M)!.task).toMatchObject({ text: "A B", projects: ["Друзья"] });
		expect(projectsOfText("A 🗂️ [[P#Цели]]")).toEqual({ projects: ["P"], text: "A" });
	});

	it("are one project for the same name twice, case aside; a mark without a name is none", () => {
		expect(parseTaskLine("- [ ] A 🗂️ Спорт 🗂️ спорт", M)!.task.projects).toEqual(["Спорт"]);
		expect(parseTaskLine("- [ ] A 🗂️", M)!.task).toMatchObject({ text: "A", projects: [] });
	});

	it("never are a plain link", () => {
		expect(parseTaskLine("- [ ] Прочитать [[Книга]]", M)!.task).toMatchObject({ text: "Прочитать [[Книга]]", projects: [] });
	});

	it("are written right after the title, before the labels and the other fields (where the app of 0.4.189 keeps them)", () => {
		const p = parseTaskLine("- [ ] A 📁 #label/Важное 🗂️ P 🗂️ Q 🔁 every day 📅 2026-11-12", M)!;
		expect(formatTaskLine(p, M)).toBe("- [ ] A 🗂️ P 🗂️ Q #label/Важное 📁 📅 2026-11-12 🔁 every day");
		expect(formatTaskLine({ indent: "", bullet: "-", task: newTask("A", { projects: ["Дружба"] }) }, M)).toBe("- [ ] A 🗂️ Дружба");
	});

	it("a subtask's are its parent's, whatever its own line says", () => {
		const doc = TaskDocument.parse("## Backlog\n- [ ] A 🗂️ P\n\t- [ ] B 🗂️ Q\n\t\t- [ ] C\n- [ ] D\n", SECTIONS, M);
		const [a, d] = doc.tasks("backlog");
		expect(a.projects).toEqual(["P"]);
		expect(a.subtasks[0].projects).toEqual(["P"]);
		expect(a.subtasks[0].subtasks[0].projects).toEqual(["P"]);
		expect(d.projects).toEqual([]);
	});
});

describe("a project's name as typed", () => {
	it("is on one line, its spaces single, without brackets, a tag's # or the mark; nothing is none", () => {
		expect(cleanProjectName("  Дружба \n  в Сербии ")).toBe("Дружба в Сербии");
		expect(cleanProjectName("[[Дружба]]")).toBe("Дружба");
		expect(cleanProjectName("🗂️ #спорт")).toBe("спорт");
		expect(cleanProjectName("  ")).toBeNull();
	});
});

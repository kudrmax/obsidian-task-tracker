import { describe, expect, it } from "vitest";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const clock: Clock = { now: () => new Date(2026, 10, 11, 12, 0) };

const FILE = [
	"## Inbox",
	"",
	"- [ ] Позвонить 🗂️ Дружба",
	"- [ ] Без проекта",
	"",
	"## Projects",
	"",
	"- Окружение в Сербии",
	"\t- Где знакомиться",
	"\t\t- Приложения для знакомств",
	"\t- Свидание",
	"- Дружба [[Моя заметка о дружбе]]",
	"\t- Small talk",
	"- Спорт",
	"",
	"## Now",
	"",
	"- [ ] Встретиться 🗂️ Дружба 🗂️ Спорт 📅 2026-11-11",
	"",
	"## Soon",
	"",
	"- [ ] Мероприятия 🗂️ Где знакомиться 🗂️ Дружба",
	"",
	"## Backlog",
	"",
	"- [ ] Шаги 🗂️ Дружба 📁",
	"\t- [ ] Первый шаг 🗂️ Дружба",
	"\t- [ ] Второй шаг",
	"- [ ] Small 🗂️ Small talk",
	"",
	"## Done",
	"",
	"- [x] Подарок 🗂️ Дружба",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const history = new UndoHistory(store);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, history, undefined, memoryProjectsScreen());
	return { store, svc, history };
}

/** Max, 2026-11-11: deleting a project never deletes, closes or moves a task. */
describe("Delete project", () => {
	it("takes only its line from the tree and only its field from every task line; every other line stays byte for byte", async () => {
		const { svc, store } = setup();
		await svc.projectsScreen();
		const before = store.text!.split("\n");
		await svc.deleteProject("Дружба");
		const after = store.text!.split("\n");
		const expected = before
			.filter((line) => line !== "- Дружба [[Моя заметка о дружбе]]")
			.map((line) => (line === "\t- Small talk" ? "- Small talk" : line))
			.map((line) => line.replace(/ 🗂️ Дружба(?= |$)/u, ""));
		expect(after).toEqual(expected);
		expect(store.text).toContain("## Inbox\n\n- [ ] Позвонить\n- [ ] Без проекта\n");
		expect(store.text).toContain("- [ ] Встретиться 🗂️ Спорт 📅 2026-11-11\n");
		expect(store.text).toContain("- [ ] Мероприятия 🗂️ Где знакомиться\n");
		expect(store.text).toContain("- [ ] Шаги 📁\n\t- [ ] Первый шаг\n\t- [ ] Второй шаг\n");
		expect(store.text).toContain("## Done\n\n- [x] Подарок\n");
	});

	it("lifts its subprojects a level into its place, in order, their tasks untouched", async () => {
		const { svc, store } = setup();
		await svc.deleteProject("Окружение в Сербии");
		expect(store.text).toContain("## Projects\n\n- Где знакомиться\n\t- Приложения для знакомств\n- Свидание\n- Дружба [[Моя заметка о дружбе]]\n\t- Small talk\n- Спорт\n");
		expect(store.text).toContain("- [ ] Мероприятия 🗂️ Где знакомиться 🗂️ Дружба\n");
	});

	it("a task left with no project shows under No project", async () => {
		const { svc } = setup();
		await svc.deleteProject("Дружба");
		await svc.selectProjectNode("none");
		const titles = (await svc.projectsScreen()).sections.flatMap((s) => s.cards.map((c) => c.item.title));
		expect(titles).toEqual(expect.arrayContaining(["Позвонить", "Шаги", "Без проекта"]));
	});

	it("is one step of undo", async () => {
		const { svc, store, history } = setup();
		await svc.projectsScreen();
		const before = store.text;
		await svc.deleteProject("Дружба");
		await history.undo();
		expect(store.text).toBe(before);
	});

	it("chosen, the screen falls back to All", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Спорт");
		await svc.deleteProject("Спорт");
		expect((await svc.projectsScreen()).selected).toBe("all");
	});

	it("a name the tree lacks changes nothing", async () => {
		const { svc, store } = setup();
		await svc.projectsScreen();
		const before = store.text;
		await svc.deleteProject("Нет такого");
		expect(store.text).toBe(before);
	});

	it("the project menu offers it, destructive, with words that say the tasks stay", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Дружба");
		expect((await svc.projectsScreen()).menu!.delete).toEqual({
			label: "Delete project",
			title: "Delete “Дружба”?",
			message: "Its tasks stay; they just lose this project.",
			confirm: "Delete",
			cancel: "Cancel",
			destructive: true,
		});
	});
});

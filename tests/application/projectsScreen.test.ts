import { describe, expect, it } from "vitest";
import type { ProjectsRow, ProjectsView, TaskItem } from "../../core/application/contracts";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { projectsGap, projectsLevels } from "../../core/application/projectsScreen";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-11";
const clock: Clock = { now: () => new Date(2026, 10, 11, 12, 0) };

/** Max's example: Serbia's surroundings with subprojects, Friendship with a note, Sport only in Backlog, a done Plane. */
const FILE = [
	"## Inbox",
	"",
	"- [ ] Свидание: в каком формате искать 🗂️ Свидание",
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
	"- Самолёт",
	"- Новый",
	"",
	"## Now",
	"",
	"- [ ] Самолет: чекнуть отмену 🗂️ Окружение в Сербии",
	"",
	"## Soon",
	"",
	"- [ ] Брейншторм плана с Клодом 🗂️ Окружение в Сербии",
	"- [ ] Найти мероприятия для друзей 🗂️ Где знакомиться 🗂️ Дружба",
	"- [ ] Гугл как улучшить общение 🗂️ Дружба 📅 2026-11-14",
	"",
	"## Backlog",
	"",
	"- [ ] Активности как ЛШ 🗂️ Где знакомиться",
	"- [ ] Зал 🗂️ Спорт",
	"- [ ] Шаги 🗂️ Small talk 📁",
	"\t- [ ] Первый шаг",
	"\t- [ ] Второй шаг",
	"",
	"## Done",
	"",
	"- [x] Купить билет 🗂️ Самолёт",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const state = memoryProjectsScreen();
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, state);
	return { store, svc, state };
}

const row = (view: ProjectsView, title: string): ProjectsRow => view.rows.find((r) => r.title === title)!;
const titles = (items: readonly { item: TaskItem }[]) => items.map((c) => c.item.title);

describe("the tree", () => {
	it("is All, the live projects with their branches, No project, Done", async () => {
		const view = await setup().svc.projectsScreen();
		expect(view.rows.map((r) => [r.title, r.depth, r.tile])).toEqual([
			["All", 0, true],
			["Окружение в Сербии", 0, true],
			["Где знакомиться", 1, false],
			["Приложения для знакомств", 2, false],
			["Свидание", 1, false],
			["Дружба", 0, true],
			["Small talk", 1, false],
			["Спорт", 0, true],
			["Новый", 0, true],
			["No project", 0, true],
			["Done", 0, true],
		]);
		expect(view.selected).toBe("all");
		expect(row(view, "All").selected).toBe(true);
	});

	/** Max, 2026-11-11: «Пусть светлее когда ВООБЩЕ нет задач, а остальное одинаково». */
	it("computes each project's state: active with an open task in its branch, any stage; waiting with none, a project of its branch without a task yet; done", async () => {
		const view = await setup().svc.projectsScreen();
		const states = Object.fromEntries(view.rows.filter((r) => r.kind === "project").map((r) => [r.title, r.status]));
		expect(states).toEqual({
			"Окружение в Сербии": "active",
			"Где знакомиться": "active",
			"Приложения для знакомств": "waiting",
			Свидание: "active",
			Дружба: "active",
			"Small talk": "active",
			Спорт: "active",
			Новый: "waiting",
		});
		expect(row(view, "Спорт").waiting).toBe(false);
		expect(row(view, "Новый").waiting).toBe(true);
		expect(row(view, "Done")).toMatchObject({ hasBranch: true, folded: true });
	});

	it("shows the done projects under Done once it is tapped open; a new task brings one back", async () => {
		const { svc, store } = setup();
		await svc.tapProjectNode("done");
		await svc.tapProjectNode("done");
		const open = await svc.projectsScreen();
		expect(open.rows.slice(-2).map((r) => [r.title, r.depth, r.canLift])).toEqual([
			["Done", 0, false],
			["Самолёт", 1, false],
		]);
		store.text = store.text!.replace("- [ ] Зал 🗂️ Спорт", "- [ ] Зал 🗂️ Спорт\n- [ ] Ещё 🗂️ Самолёт");
		expect(row(await svc.projectsScreen(), "Самолёт")).toMatchObject({ depth: 0, status: "active" });
	});

	it("a tap chooses a node; a tap on the chosen one folds its branch", async () => {
		const { svc } = setup();
		await svc.tapProjectNode("project:Окружение в Сербии");
		expect((await svc.projectsScreen()).selected).toBe("project:Окружение в Сербии");
		await svc.tapProjectNode("project:Окружение в Сербии");
		const folded = await svc.projectsScreen();
		expect(row(folded, "Окружение в Сербии")).toMatchObject({ folded: true, unfoldsOnHover: true });
		expect(folded.rows.map((r) => r.title)).not.toContain("Где знакомиться");
		await svc.selectProjectNode("project:Приложения для знакомств");
		expect(row(await svc.projectsScreen(), "Приложения для знакомств").selected).toBe(true);
	});
});

describe("a project's tasks", () => {
	it("By project: its own first, untitled, then each subproject's at any depth, an empty one too; each card's stage or date", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Окружение в Сербии");
		const view = await svc.projectsScreen();
		expect(view.title).toBe("Окружение в Сербии");
		expect(view.sections.map((s) => [s.title, s.depth, titles(s.cards)])).toEqual([
			[null, 0, ["Брейншторм плана с Клодом", "Самолет: чекнуть отмену"]],
			["Где знакомиться", 1, ["Активности как ЛШ", "Найти мероприятия для друзей"]],
			["Приложения для знакомств", 2, []],
			["Свидание", 1, ["Свидание: в каком формате искать"]],
		]);
		expect(view.sections[0].cards.map((c) => c.stage)).toEqual([{ kind: "soon" }, { kind: "today" }]);
		expect(view.sections[3].cards[0]).toMatchObject({ stage: { kind: "inbox" }, from: "Свидание", menuFrom: "inbox", over: null });
		expect(view.sections[1].newTask).toEqual({ place: { kind: "list", list: "inbox", group: null, before: null }, project: "Где знакомиться" });
		expect(view.sections[0].cards[0].item.project).toMatchObject({ name: "Окружение в Сербии", mark: false });
	});

	it("a dated card shows its date", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Дружба");
		const view = await svc.projectsScreen();
		const card = view.sections[0].cards.find((c) => c.item.title === "Гугл как улучшить общение")!;
		expect(card.stage).toEqual({ kind: "date", date: "2026-11-14", label: { day: "14", month: "NOV" } });
	});

	it("By stage: Inbox, Backlog, Soon, Today, each card with the subproject it is in", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Окружение в Сербии");
		await svc.setProjectsMode("byStage");
		const view = await svc.projectsScreen();
		expect(view.sections.map((s) => [s.title, s.cards.map((c) => [c.item.title, c.over])])).toEqual([
			["Inbox", [["Свидание: в каком формате искать", "Свидание"]]],
			["Backlog", [["Активности как ЛШ", "Где знакомиться"]]],
			["Soon", [["Брейншторм плана с Клодом", null], ["Найти мероприятия для друзей", "Где знакомиться"]]],
			["Today", [["Самолет: чекнуть отмену", null]]],
		]);
		expect(view.sections[3].newTask).toEqual({ place: { kind: "list", list: "now", group: null, before: null }, project: "Окружение в Сербии" });
	});

	it("All By stage gives each card its project; No project its tasks without one; Done the done projects' tasks", async () => {
		const { svc } = setup();
		await svc.setProjectsMode("byStage");
		const all = await svc.projectsScreen();
		expect(all.sections[3].cards.map((c) => c.over)).toEqual(["Окружение в Сербии"]);
		await svc.tapProjectNode("none");
		expect((await svc.projectsScreen()).sections.flatMap((s) => titles(s.cards))).toEqual(["Без проекта"]);
		await svc.setProjectsMode("byProject");
		await svc.tapProjectNode("done");
		const done = await svc.projectsScreen();
		expect(done.sections.map((s) => [s.title, titles(s.cards)])).toEqual([["Самолёт", ["Купить билет"]]]);
		expect(done.newTask).toBeNull();
	});

	it("the project menu: Rename and Note, the note's name when one is attached", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Дружба");
		expect((await svc.projectsScreen()).menu).toMatchObject({ renameLabel: "Rename", noteLabel: "Note", note: { link: "Моя заметка о дружбе", name: "Моя заметка о дружбе" }, detachLabel: "Detach" });
		await svc.tapProjectNode("all");
		expect((await svc.projectsScreen()).menu).toBeNull();
	});
});

describe("a folded task with subtasks", () => {
	it("shows its next open subtask, as results did, whatever it is", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const card = screen.backlog.find((i) => i.title === "Шаги")!.card;
		expect(card).toMatchObject({ title: "Первый шаг", over: "Шаги" });
	});
});

describe("the writes", () => {
	it("a card dropped on a project: the project it was shown under gives way, the others and its place stay", async () => {
		const { svc, store } = setup();
		await svc.selectProjectNode("project:Дружба");
		const card = (await svc.projectsScreen()).sections[0].cards.find((c) => c.item.title === "Найти мероприятия для друзей")!;
		await svc.dropOnProject([card.drop], "project:Small talk");
		expect(store.text).toContain("## Soon\n\n- [ ] Брейншторм плана с Клодом 🗂️ Окружение в Сербии\n- [ ] Найти мероприятия для друзей 🗂️ Где знакомиться 🗂️ Small talk\n");
	});

	it("dropped on No project, it loses that project only", async () => {
		const { svc, store } = setup();
		const view = await svc.projectsScreen();
		const card = view.sections.find((s) => s.title === "Где знакомиться")!.cards.find((c) => c.item.title === "Найти мероприятия для друзей")!;
		await svc.dropOnProject([card.drop], "none");
		expect(store.text).toContain("- [ ] Найти мероприятия для друзей 🗂️ Дружба\n");
	});

	it("the Project page checks several projects and toggles one on or off for all", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const item = screen.backlog.find((i) => i.title === "Зал")!;
		const page = svc.menu(item, "backlog", { today: T, day: T, offer: screen.offer }).project;
		expect(page.options.map((o) => [o.project.name, o.depth, o.checked]).slice(0, 3)).toEqual([
			["Окружение в Сербии", 0, false],
			["Где знакомиться", 1, false],
			["Приложения для знакомств", 2, false],
		]);
		expect(page.value).toBe("Спорт");
		await svc.toggleProject([item.key], "Дружба");
		expect(store.text).toContain("- [ ] Зал 🗂️ Спорт 🗂️ Дружба\n");
		const two = (await svc.screen(T)).backlog.find((i) => i.title === "Зал")!;
		expect(svc.menu(two, "backlog", { today: T, day: T, offer: screen.offer }).project.value).toBe("Спорт +1");
		await svc.toggleProject([two.key], "Спорт");
		expect(store.text).toContain("- [ ] Зал 🗂️ Дружба\n");
	});

	it("New project… makes it at the tree's top and checks it on the tasks; a name the tree has is that project", async () => {
		const { svc, store } = setup();
		const item = (await svc.screen(T)).inbox.find((i) => i.title === "Без проекта")!;
		expect(await svc.newProject("  Английский ", [item.key])).toMatchObject({ name: "Английский", path: ["Английский"] });
		expect(store.text).toContain("- [ ] Без проекта 🗂️ Английский\n");
		expect(store.text).toContain("- Новый\n- Английский\n");
		expect(await svc.newProject("спорт", [])).toMatchObject({ name: "Спорт" });
		expect(await svc.newProject(" ", [])).toBeNull();
	});

	it("the plus in the tree makes a project at its place and chooses it; a lifted one moves with its branch", async () => {
		const { svc, store } = setup();
		const made = await svc.createProject("Мероприятия", { parent: "Окружение в Сербии", before: "Свидание" });
		expect(made).toMatchObject({ path: ["Окружение в Сербии", "Мероприятия"] });
		expect((await svc.projectsScreen()).selected).toBe("project:Мероприятия");
		expect(store.text).toContain("\t\t- Приложения для знакомств\n\t- Мероприятия\n\t- Свидание\n");
		await svc.moveProject("Где знакомиться", { parent: "Дружба", before: null });
		expect(store.text).toContain("- Дружба [[Моя заметка о дружбе]]\n\t- Small talk\n\t- Где знакомиться\n\t\t- Приложения для знакомств\n");
		expect(await svc.createProject("дружба", { parent: null, before: null })).toBeNull();
	});

	it("Rename renames the tree's line and every task's field, and the screen keeps it chosen", async () => {
		const { svc, store } = setup();
		await svc.selectProjectNode("project:Где знакомиться");
		expect(await svc.renameProject("Где знакомиться", "Знакомства")).toBe(true);
		expect(store.text).toContain("- [ ] Активности как ЛШ 🗂️ Знакомства\n");
		expect(store.text).toContain("\t- Знакомства\n");
		expect((await svc.projectsScreen()).selected).toBe("project:Знакомства");
		expect(await svc.renameProject("Знакомства", "дружба")).toBe(false);
	});

	it("Note attaches a note by its link and detaches it, the note's file untouched", async () => {
		const { svc, store } = setup();
		await svc.setProjectNote("Спорт", "[[Тренировки]]");
		expect(store.text).toContain("- Спорт [[Тренировки]]\n");
		await svc.setProjectNote("Дружба", null);
		expect(store.text).toContain("- Дружба\n\t- Small talk\n");
	});

	it("a project typed by hand in a task, missing from the tree, shows at its top and is written into it on the next write", async () => {
		const { svc, store } = setup(FILE.replace("- [ ] Без проекта", "- [ ] Без проекта 🗂️ Английский"));
		expect((await svc.projectsScreen()).rows.map((r) => r.title)).toContain("Английский");
		const item = (await svc.screen(T)).inbox[0];
		await svc.setStatus(item.key, "inProgress");
		expect(store.text).toContain("- Новый\n- Английский\n");
	});
});

describe("search", () => {
	it("gives each hit its project's path", async () => {
		const { svc } = setup();
		const hits = (await svc.search("ЛШ")).flatMap((g) => g.hits);
		expect(hits[0].projectPath).toEqual(["Окружение в Сербии", "Где знакомиться"]);
	});
});

describe("the tree's gaps", () => {
	it("take a depth from the row below's to one deeper than the row above's, and name the place", async () => {
		const view = await setup().svc.projectsScreen();
		const gap = view.rows.findIndex((r) => r.title === "Свидание");
		expect(projectsLevels(view.rows, gap)).toEqual({ min: 1, max: 3 });
		expect(projectsGap(view.rows, gap, 1)).toEqual({ place: { parent: "Окружение в Сербии", before: "Свидание" }, depth: 1 });
		expect(projectsGap(view.rows, gap, 3)).toEqual({ place: { parent: "Приложения для знакомств", before: null }, depth: 3 });
		expect(projectsGap(view.rows, gap, 0)).toMatchObject({ depth: 1 });
		const end = view.rows.findIndex((r) => r.kind === "none");
		expect(projectsGap(view.rows, end, 0)).toEqual({ place: { parent: null, before: null }, depth: 0 });
		expect(projectsGap(view.rows, 0, 0)).toEqual({ place: { parent: null, before: "Окружение в Сербии" }, depth: 0 });
	});

	it("leave the lifted project and its branch out", async () => {
		const view = await setup().svc.projectsScreen();
		const lifted = "project:Где знакомиться";
		const gap = view.rows.findIndex((r) => r.title === "Свидание");
		expect(projectsLevels(view.rows, gap, lifted)).toEqual({ min: 1, max: 1 });
		expect(projectsGap(view.rows, gap, 2, lifted)).toEqual({ place: { parent: "Окружение в Сербии", before: "Свидание" }, depth: 1 });
	});
});

describe("the one move to projects, whatever the first write is", () => {
	const OLD = ["## Inbox", "", "- [ ] Позвонить 🗂️ [[Дружба]]", "- [ ] 🎯 iPhone", "\t- [ ] План", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
	const notes = { list: () => [{ name: "Дружба", path: "Дружба.md", link: "Дружба" }, { name: "Спорт", path: "Спорт.md", link: "Спорт" }], onChange: () => () => undefined };
	const service = (text: string) => {
		const store = new InMemoryTaskFileStore(text);
		return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, notes) };
	};

	it("is written as soon as the file is read, as tidying is, no step of undo", async () => {
		const store = new InMemoryTaskFileStore(OLD);
		const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), notes);
		await svc.screen(T);
		expect(store.text).toBe(["## Inbox", "", "- [ ] Позвонить 🗂️ Дружба", "- [ ] iPhone", "\t- [ ] План", "", "## Projects", "", "- Дружба [[Дружба]]", "- Спорт [[Спорт]]", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n"));
		expect(await svc.projectsScreen()).toMatchObject({ missing: false });
	});

	it("runs before the first action, so a project made then goes after the moved ones", async () => {
		const { store, svc } = service(OLD);
		await svc.createProject("Новый", { parent: null, before: null });
		expect(store.text).toBe(["## Inbox", "", "- [ ] Позвонить 🗂️ Дружба", "- [ ] iPhone", "\t- [ ] План", "", "## Projects", "", "- Дружба [[Дружба]]", "- Спорт [[Спорт]]", "- Новый", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n"));
	});

	it("is not stopped by a ## Projects written by hand: old fields and 🎯 lines are moved, every note attached while the tree holds none yet", async () => {
		const { store, svc } = service(OLD.replace("## Now", "## Projects\n\n- Дружба\n\n## Now"));
		await svc.setStatus((await svc.screen(T)).inbox[0].key, "inProgress");
		expect(store.text).toContain("- [/] Позвонить 🗂️ Дружба\n- [ ] iPhone\n");
		expect(store.text).toContain("## Projects\n\n- Дружба [[Дружба]]\n- Спорт [[Спорт]]\n\n## Now");
	});

	it("leaves a moved file's plain lines as they are", async () => {
		const plain = "## Inbox\n\n- [ ] A #label/x 🗂️ Дружба\n- [ ] B\n\n## Projects\n\n- Дружба\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n";
		const { store, svc } = service(plain);
		await svc.setStatus((await svc.screen(T)).inbox[1].key, "inProgress");
		expect(store.text).toBe(plain.replace("- [ ] B", "- [/] B"));
	});
});

describe("the frontends' follow-ups", () => {
	it("a held card unfolds a folded branch without choosing it", async () => {
		const { svc } = setup();
		await svc.tapProjectNode("project:Окружение в Сербии");
		await svc.tapProjectNode("project:Окружение в Сербии");
		await svc.tapProjectNode("all");
		await svc.unfoldProjectNode("project:Окружение в Сербии");
		const view = await svc.projectsScreen();
		expect(row(view, "Окружение в Сербии")).toMatchObject({ folded: false, selected: false });
		expect(view.selected).toBe("all");
		await svc.unfoldProjectNode("done");
		expect((await svc.projectsScreen()).rows.map((r) => r.title)).toContain("Самолёт");
	});

	it("toggleProject answers the tasks as they then stand", async () => {
		const { svc } = setup();
		const item = (await svc.screen(T)).backlog.find((i) => i.title === "Зал")!;
		const [after] = await svc.toggleProject([item.key], "Дружба");
		expect(after!.projects.map((p) => p.name)).toEqual(["Спорт", "Дружба"]);
	});

	it("the tree's projects, in its order, for the quick entry's button", async () => {
		const { svc } = setup();
		await svc.screen(T);
		expect(svc.projects().map((p) => p.name).slice(0, 3)).toEqual(["Окружение в Сербии", "Где знакомиться", "Приложения для знакомств"]);
	});

	it("No project, Done, a project with no open task in its branch and a done one are drawn grey; one with an open task anywhere is not", async () => {
		const { svc } = setup();
		await svc.unfoldProjectNode("done");
		const view = await svc.projectsScreen();
		expect(["All", "Окружение в Сербии", "Спорт", "Новый", "No project", "Done", "Самолёт"].map((t) => row(view, t).muted)).toEqual([false, false, false, true, true, true, true]);
	});
});

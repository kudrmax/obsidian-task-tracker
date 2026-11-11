import { describe, expect, it } from "vitest";
import { projectsTakes, type ProjectsSection, type ProjectsView } from "../../core/application/contracts";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { entryProject } from "../../core/application/QuickEntry";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const clock: Clock = { now: () => new Date(2026, 10, 11, 12, 0) };
const T = "2026-11-11";

const FILE = [
	"## Inbox",
	"",
	"- [ ] Отчёт за октябрь 🗂️ Отчёты",
	"- [ ] Без проекта",
	"",
	"## Projects",
	"",
	"- Работа 🗃️",
	"\t- Отчёты",
	"\t- Найм",
	"- Дружба",
	"",
	"## Now",
	"",
	"## Soon",
	"",
	"- [ ] Позвонить 🗂️ Дружба",
	"",
	"## Backlog",
	"",
	"- [ ] Резюме 🗂️ Найм",
	"",
	"## Done",
	"",
	"- [x] Old 🗂️ Найм",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const history = new UndoHistory(store);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, history, undefined, memoryProjectsScreen());
	return { store, svc, history };
}

async function chosen(node: string, mode: "byProject" | "byStage" = "byProject", text = FILE) {
	const s = setup(text);
	await s.svc.selectProjectNode(node);
	await s.svc.setProjectsMode(mode);
	return { ...s, view: await s.svc.projectsScreen() };
}

const part = (view: ProjectsView, title: string | null): ProjectsSection => view.sections.find((s) => s.title === title)!;
const cardIn = (section: ProjectsSection, title: string) => section.cards.find((c) => c.item.title === title)!;

/** Max, 2026-11-11: a folder only holds subprojects; no task can be put straight into it. */
describe("the project menu's Folder", () => {
	it("is on for a folder and may be turned off; a project without tasks of its own may turn it on", async () => {
		expect((await chosen("project:Работа")).view.menu!.folder).toEqual({ label: "Folder", on: true, disabled: false, reason: null });
		expect((await chosen("project:Отчёты", "byProject", FILE.replace("- [ ] Отчёт за октябрь 🗂️ Отчёты", "- [ ] Отчёт за октябрь"))).view.menu!.folder).toEqual({ label: "Folder", on: false, disabled: false, reason: null });
	});

	it("is disabled with the reason while the project has tasks of its own, open or done; its subprojects' don't count", async () => {
		expect((await chosen("project:Дружба")).view.menu!.folder).toEqual({ label: "Folder", on: false, disabled: true, reason: "Has tasks of its own" });
		expect((await chosen("project:Найм", "byProject", FILE.replace("- [ ] Резюме 🗂️ Найм", "- [ ] Резюме"))).view.menu!.folder.disabled).toBe(true);
	});

	it("writes the mark on the tree line, one step of undo; refused for a project with tasks of its own", async () => {
		const { svc, store, history } = setup();
		await svc.projectsScreen();
		expect(await svc.setProjectFolder("Работа", false)).toBe(true);
		expect(store.text).toContain("## Projects\n\n- Работа\n\t- Отчёты\n");
		await history.undo();
		expect(store.text).toBe(FILE);
		const before = store.text;
		expect(await svc.setProjectFolder("Дружба", true)).toBe(false);
		expect(store.text).toBe(before);
	});

	it("shows the folder in every ProjectRef", async () => {
		const { svc } = setup();
		const view = await svc.projectsScreen();
		expect(view.rows.filter((r) => r.project?.folder).map((r) => r.title)).toEqual(["Работа"]);
		expect(svc.projects().map((p) => [p.name, p.folder])).toEqual([
			["Работа", true],
			["Отчёты", false],
			["Найм", false],
			["Дружба", false],
		]);
	});
});

describe("a folder takes no task", () => {
	it("the Project page and the quick entry show it, its subprojects checkable under it, it not", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const item = screen.inbox.find((i) => i.title === "Без проекта")!;
		const page = svc.menu(item, "inbox", { today: T, day: T, offer: screen.offer, projects: screen.projectTree }).project;
		expect(page.options.map((o) => [o.project.name, o.depth, o.disabled])).toEqual([
			["Работа", 0, true],
			["Отчёты", 1, false],
			["Найм", 1, false],
			["Дружба", 0, false],
		]);
		expect(entryProject(null, svc.projects()).page.options.map((o) => o.disabled)).toEqual([true, false, false, false]);
	});

	it("a task that has a folder by hand shows it checked, and may take it off", async () => {
		const { svc, store } = setup(FILE.replace("- [ ] Без проекта", "- [ ] Без проекта 🗂️ Работа"));
		const screen = await svc.screen(T);
		const item = screen.inbox.find((i) => i.title === "Без проекта")!;
		expect(item.project?.name).toBe("Работа");
		const option = svc.menu(item, "inbox", { today: T, day: T, offer: screen.offer, projects: screen.projectTree }).project.options[0];
		expect([option.checked, option.disabled]).toEqual([true, false]);
		await svc.toggleProject([item.key], "Работа");
		expect(store.text).toContain("- [ ] Без проекта\n");
	});

	it("toggleProject, setProject, newProject and dropOnProject never give a task a folder", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const item = screen.inbox.find((i) => i.title === "Без проекта")!;
		const before = store.text;
		const [same] = await svc.toggleProject([item.key], "Работа");
		expect(same?.project).toBeNull();
		await svc.setProject([item.key], "работа");
		expect(await svc.newProject("Работа", [item.key])).toBeNull();
		const view = await svc.projectsScreen();
		await svc.dropOnProject([cardIn(part(view, "Дружба"), "Позвонить").drop], "project:Работа");
		expect(store.text).toBe(before);
	});

	it("a new task named with a folder is made without it", async () => {
		const { svc, store } = setup();
		await svc.createInPlace("Новая", null, { kind: "list", list: "inbox", group: null, before: null }, null, [], "Работа");
		expect(store.text).toContain("- [ ] Без проекта\n- [ ] Новая\n");
	});

	it("creating projects inside a folder stays", async () => {
		const { svc, store } = setup();
		expect(await svc.createProject("Бюджет", { parent: "Работа", before: null })).toMatchObject({ name: "Бюджет", folder: false });
		expect(store.text).toContain("- Работа 🗃️\n\t- Отчёты\n\t- Найм\n\t- Бюджет\n");
	});

	it("its tree row takes no card; its subprojects' do", async () => {
		const view = await setup().svc.projectsScreen();
		expect(view.rows.filter((r) => r.kind === "project").map((r) => [r.title, r.acceptsTask])).toEqual([
			["Работа", false],
			["Отчёты", true],
			["Найм", true],
			["Дружба", true],
		]);
	});
});

describe("a folder's Projects list", () => {
	it("By project: no own part, its subprojects' parts take cards and write them; no plus outside them", async () => {
		const { view } = await chosen("project:Работа");
		expect(view.sections.map((s) => [s.title, s.takes, s.newTask?.project ?? null, s.opens])).toEqual([
			["Отчёты", true, "Отчёты", true],
			["Найм", true, "Найм", true],
		]);
		expect(view.newTask).toBeNull();
		expect(view.menu!.project.folder).toBe(true);
	});

	it("By project with a task that has the folder by hand: its own part shows it, takes no drop, has no plus or plate", async () => {
		const { svc, store, view } = await chosen("project:Работа", "byProject", FILE.replace("- [ ] Без проекта", "- [ ] Без проекта 🗂️ Работа"));
		const own = view.sections[0];
		expect([own.title, own.takes, own.newTask, own.plate, own.cards.map((c) => c.item.title)]).toEqual([null, false, null, false, ["Без проекта"]]);
		expect(view.sections[1]).toMatchObject({ title: "Отчёты", opens: true });
		const card = cardIn(part(view, "Отчёты"), "Отчёт за октябрь");
		const into = { kind: "task", group: null, before: null } as const;
		expect(projectsTakes(view, [card.drop], into)).toBe(false);
		const before = store.text;
		await svc.dropInProjects([card.drop], into);
		const under = { kind: "subtask", parent: own.cards[0].item.key, before: null } as const;
		expect(projectsTakes(view, [card.drop], under)).toBe(false);
		await svc.dropInProjects([card.drop], under);
		expect(store.text).toBe(before);
	});

	it("By stage: the stages take cards and only move them; no plus names the folder", async () => {
		const { svc, store, view } = await chosen("project:Работа", "byStage");
		expect(view.sections.map((s) => [s.title, s.takes, s.newTask])).toEqual([
			["Inbox", true, null],
			["Backlog", true, null],
			["Soon", true, null],
			["Today", true, null],
		]);
		expect(view.newTask).toBeNull();
		const card = cardIn(part(view, "Backlog"), "Резюме");
		await svc.dropInProjects([card.drop], { kind: "task", group: "inbox", before: null });
		expect(store.text).toContain("- [ ] Отчёт за октябрь 🗂️ Отчёты\n- [ ] Резюме 🗂️ Найм\n");
	});

	it("By stage, nothing nests under a task that has the folder by hand, nor under its subtasks", async () => {
		const text = FILE.replace("- [ ] Без проекта", "- [ ] Без проекта 🗂️ Работа\n\t- [ ] Шаг");
		const { svc, store, view } = await chosen("project:Работа", "byStage", text);
		const inbox = part(view, "Inbox");
		const card = cardIn(part(view, "Backlog"), "Резюме");
		const under = (title: string) => ({ kind: "subtask", parent: inbox.rows.find((r) => r.item.title === title)!.item.key, before: null }) as const;
		expect(projectsTakes(view, [card.drop], under("Без проекта"))).toBe(false);
		expect(projectsTakes(view, [card.drop], under("Шаг"))).toBe(false);
		expect(projectsTakes(view, [card.drop], under("Отчёт за октябрь"))).toBe(true);
		const before = store.text;
		await svc.dropInProjects([card.drop], under("Без проекта"));
		expect(store.text).toBe(before);
	});

	it("All By project: an empty folder's part is left out; one with a task of its own by hand takes nothing", async () => {
		const all = (await chosen("all")).view;
		expect(all.sections.map((s) => s.title)).toEqual(["Отчёты", "Найм", "Дружба"]);
		const hand = (await chosen("all", "byProject", FILE.replace("- [ ] Без проекта", "- [ ] Без проекта 🗂️ Работа"))).view;
		expect(part(hand, "Работа")).toMatchObject({ takes: false, newTask: null, plate: false });
		expect(part(hand, "Дружба")).toMatchObject({ takes: true, newTask: { project: "Дружба" } });
	});

	it("a project above a folder: the folder's part is left out, its subprojects' stay", async () => {
		const text = FILE.replace("- Работа 🗃️\n\t- Отчёты\n\t- Найм\n- Дружба", "- Дружба\n\t- Работа 🗃️\n\t\t- Отчёты\n\t\t- Найм");
		const { view } = await chosen("project:Дружба", "byProject", text);
		expect(view.sections.map((s) => [s.title, s.depth, s.takes])).toEqual([
			[null, 0, true],
			["Отчёты", 2, true],
			["Найм", 2, true],
		]);
	});
});

/** Max, 2026-11-11: «Пусть светлее когда ВООБЩЕ нет задач, а остальное одинаково». */
describe("a grey name in the tree", () => {
	const GREY = [
		"## Inbox",
		"",
		"- [ ] Идея 🗂️ Входящие",
		"",
		"## Projects",
		"",
		"- Входящие",
		"- Пусто",
		"- Работа 🗃️",
		"\t- Отчёты",
		"\t- Найм",
		"- Дом 🗃️",
		"\t- Ремонт",
		"- Сад",
		"",
		"## Now",
		"",
		"## Soon",
		"",
		"## Backlog",
		"",
		"- [ ] Резюме 🗂️ Найм",
		"",
		"## Done",
		"",
		"- [x] Старое 🗂️ Сад",
		"- [ ] Не та 🗂️ Ремонт",
		"",
	].join("\n");

	it("only where the whole branch has no open task; any open one, in any stage, gives the full colour", async () => {
		const view = await setup(GREY).svc.projectsScreen();
		const live = view.rows.filter((r) => r.kind === "project").map((r) => [r.title, r.muted, r.waiting, r.status]);
		expect(live).toEqual([
			["Входящие", false, false, "active"],
			["Пусто", true, true, "waiting"],
			["Работа", false, false, "active"],
			["Отчёты", true, true, "waiting"],
			["Найм", false, false, "active"],
			["Дом", true, true, "waiting"],
			["Ремонт", true, true, "waiting"],
		]);
		expect(view.rows.find((r) => r.title === "Done")!.hasBranch).toBe(true);
	});
});

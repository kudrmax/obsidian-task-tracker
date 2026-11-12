import { describe, expect, it } from "vitest";
import type { EntryLook } from "../../core/application/QuickEntry";
import { QuickEntrySession } from "../../core/application/QuickEntrySession";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { FUNNEL_PLACES, funnelPlaceShowing, stepFunnel } from "../../core/application/screenPlaces";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { viewEntryLists } from "../../core/application/viewModes";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-12";
const clock: Clock = { now: () => new Date(2026, 10, 12, 12, 0) };

/** Max's example of the spec: «Стиль, внешность» with a subproject, tasks of other projects and none between them. */
const FILE = [
	"## Inbox",
	"",
	"- [ ] Подобрать очки 🗂️ Стиль, внешность",
	"- [ ] Без проекта",
	"- [ ] Купить кроссовки 🗂️ Гардероб",
	"- [ ] Позвонить другу 🗂️ Дружба",
	"",
	"## Projects",
	"",
	"- Стиль, внешность [[Заметки/Стиль]]",
	"\t- Гардероб",
	"- Дружба",
	"- Самолёт",
	"",
	"## Now",
	"",
	"- [ ] Утренняя зарядка",
	"",
	"## Soon",
	"",
	"- [ ] Найти барбершоп 🗂️ Стиль, внешность",
	"\t- [ ] Почитать отзывы",
	"- [ ] Записаться к врачу",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
	"- [x] Купить билет 🗂️ Самолёт",
	"",
].join("\n");

const STYLE = "project:Стиль, внешность";

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const state = memoryProjectsScreen();
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, state);
	return { store, svc, state };
}

const titles = (items: readonly TaskItem[]) => items.map((i) => i.title);
const lists = (s: ScreenView) => ({ inbox: titles(s.inbox), backlog: titles(s.backlog), soon: titles(s.soon), day: titles(s.day.list), done: titles(s.done) });

describe("the screen under a filter", () => {
	it("shows a project's branch in every list, a subtask with its task, and no folder mark on its cards", async () => {
		const screen = await setup().svc.screen(T, STYLE);
		expect(lists(screen)).toEqual({ inbox: ["Подобрать очки", "Купить кроссовки"], backlog: [], soon: ["Найти барбершоп"], day: [], done: [] });
		expect(titles(screen.soon[0].subtasks)).toEqual(["Почитать отзывы"]);
		expect(screen.inbox[0].project).toMatchObject({ name: "Стиль, внешность", mark: false });
		expect(screen.projectTree.map((p) => p.name)).toEqual(["Стиль, внешность", "Гардероб", "Дружба", "Самолёт"]);
	});

	it("All: every task with a project; No project: every task without; Done: the done projects' tasks", async () => {
		const { svc } = setup();
		expect(lists(await svc.screen(T, "all"))).toEqual({ inbox: ["Подобрать очки", "Купить кроссовки", "Позвонить другу"], backlog: [], soon: ["Найти барбершоп"], day: [], done: ["Купить билет"] });
		expect(lists(await svc.screen(T, "none"))).toEqual({ inbox: ["Без проекта"], backlog: [], soon: ["Записаться к врачу"], day: ["Утренняя зарядка"], done: [] });
		expect(lists(await svc.screen(T, "done"))).toEqual({ inbox: [], backlog: [], soon: [], day: [], done: ["Купить билет"] });
		expect((await svc.screen(T, "all")).inbox[0].project?.mark).toBe(true);
	});

	it("no filter, or a project the tree lacks, shows every task", async () => {
		const { svc } = setup();
		const whole = lists(await svc.screen(T));
		expect(lists(await svc.screen(T, null))).toEqual(whole);
		expect(lists(await svc.screen(T, "project:Нет такого"))).toEqual(whole);
		expect(whole.inbox).toHaveLength(4);
	});
});

describe("writes under a filter", () => {
	it("a drop at a list's end goes right after the last task the filter shows, not after the hidden ones", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T, STYLE);
		const doctor = (await svc.screen(T)).soon.find((i) => i.title === "Записаться к врачу")!;
		await svc.drop([{ key: doctor.key, from: "soon" }], { kind: "place", column: "inbox", place: { kind: "task", group: null, before: null } }, T, STYLE);
		expect(store.text).toContain("- [ ] Купить кроссовки 🗂️ Гардероб\n- [ ] Записаться к врачу\n- [ ] Позвонить другу 🗂️ Дружба\n");
		expect(screen.inbox).toHaveLength(2);
	});

	it("a drop before a shown task, and one with no filter, stay as they were", async () => {
		const { svc, store } = setup();
		const doctor = (await svc.screen(T)).soon.find((i) => i.title === "Записаться к врачу")!;
		await svc.drop([{ key: doctor.key, from: "soon" }], { kind: "place", column: "inbox", place: { kind: "task", group: null, before: null } }, T);
		expect(store.text).toContain("- [ ] Позвонить другу 🗂️ Дружба\n- [ ] Записаться к врачу\n");
	});

	it("the preview reads the filtered screen the drop leaves: a task the filter hides lands away", async () => {
		const { svc } = setup();
		const doctor = (await svc.screen(T)).soon.find((i) => i.title === "Записаться к врачу")!;
		const preview = await svc.dropPreview([{ key: doctor.key, from: "soon" }], { kind: "place", column: "inbox", place: { kind: "task", group: null, before: null } }, T, STYLE);
		expect(preview.landings[0].kind).toBe("away");
		expect(titles(preview.screen.inbox)).toEqual(["Подобрать очки", "Купить кроссовки"]);
		const shown = (await svc.screen(T, STYLE)).inbox[0];
		const own = await svc.dropPreview([{ key: shown.key, from: "inbox" }], { kind: "place", column: "soon", place: { kind: "task", group: null, before: null } }, T, STYLE);
		expect(own.landings[0]).toMatchObject({ kind: "list", column: "soon", index: 1 });
	});

	it("a task typed at a list's end goes after the last shown one, with the project given", async () => {
		const { svc, store } = setup();
		await svc.createInPlace("Новая стрижка", null, { kind: "list", list: "inbox", group: null, before: null }, null, [], "Стиль, внешность", STYLE);
		expect(store.text).toContain("- [ ] Купить кроссовки 🗂️ Гардероб\n- [ ] Новая стрижка 🗂️ Стиль, внешность\n- [ ] Позвонить другу");
		await svc.createInPlace("Пусто", null, { kind: "day", date: T, group: null, before: null }, null, [], null, STYLE);
		expect(store.text).toContain("- [ ] Утренняя зарядка\n- [ ] Пусто 📅");
	});

	it("a card of the funnel dropped on a row: the project the filter shows it by gives way; no filter, its first project", async () => {
		const { svc, store } = setup();
		const shoes = (await svc.screen(T)).inbox.find((i) => i.title === "Купить кроссовки")!;
		await svc.dropTasksOnProject([shoes.key], "project:Дружба", STYLE);
		expect(store.text).toContain("- [ ] Купить кроссовки 🗂️ Дружба\n");
		const loose = (await svc.screen(T)).inbox.find((i) => i.title === "Без проекта")!;
		await svc.dropTasksOnProject([loose.key], "project:Самолёт", null);
		expect(store.text).toContain("- [ ] Без проекта 🗂️ Самолёт\n");
		const glasses = (await svc.screen(T)).inbox.find((i) => i.title === "Подобрать очки")!;
		await svc.dropTasksOnProject([glasses.key], "none", null);
		expect(store.text).toContain("- [ ] Подобрать очки\n");
	});
});

describe("the funnel's view", () => {
	it("starts with no filter, two columns with the wheel, the panel closed and no row chosen", async () => {
		const view = await setup().svc.funnelView(true);
		expect(view.filter).toBeNull();
		expect(view.view).toMatchObject({ mode: "twoColumns", icon: "columns-2", wheel: true, rows: [] });
		expect(view.view.modes.map((m) => [m.mode, m.label, m.checked])).toEqual([
			["twoColumns", "Two columns", true],
			["allColumns", "All columns", false],
			["rows", "Rows", false],
		]);
		expect(view.panel).toMatchObject({ open: false, docked: true, missing: false });
		expect(view.panel!.rows.filter((r) => r.selected)).toEqual([]);
		expect(view.panel!.rows.map((r) => r.title)).toEqual(["All", "Стиль, внешность", "Гардероб", "Дружба", "No project", "Done"]);
	});

	it("on a narrow screen: Columns and Rows, no All columns, the panel over the lists", async () => {
		const view = await setup().svc.funnelView(false);
		expect(view.view.modes.map((m) => [m.mode, m.label])).toEqual([
			["twoColumns", "Columns"],
			["rows", "Rows"],
		]);
		expect(view.panel!.docked).toBe(false);
	});

	it("a pick filters by the node: its title and menu, the cross, rows by default and By project offered", async () => {
		const { svc } = setup();
		await svc.pickProjectNode(STYLE, true);
		const view = await svc.funnelView(true);
		expect(view.filter).toMatchObject({ node: STYLE, title: "Стиль, внешность", clearable: true, project: "Стиль, внешность", emptyLabel: "No tasks" });
		expect(view.filter!.menu?.project.name).toBe("Стиль, внешность");
		expect(view.view).toMatchObject({ mode: "rows", wheel: false, icon: "rows-3", rows: ["inbox", "backlog", "soon", "day"] });
		expect(view.view.modes.map((m) => m.mode)).toEqual(["twoColumns", "allColumns", "rows", "byProject"]);
		expect(view.panel!.rows.filter((r) => r.selected).map((r) => r.title)).toEqual(["Стиль, внешность"]);
	});

	it("keeps a mode for the plain screen and another for a filtered one", async () => {
		const { svc } = setup();
		await svc.setViewMode("allColumns");
		await svc.pickProjectNode(STYLE, true);
		expect((await svc.funnelView(true)).view.mode).toBe("rows");
		await svc.setViewMode("byProject");
		expect((await svc.funnelView(true)).view.mode).toBe("byProject");
		await svc.clearProjectFilter();
		const plain = await svc.funnelView(true);
		expect(plain.filter).toBeNull();
		expect(plain.view.mode).toBe("allColumns");
		expect((await svc.funnelView(false)).view.mode).toBe("twoColumns");
	});

	it("All and No project have no menu and give no project; No project offers no By project", async () => {
		const { svc } = setup();
		await svc.pickProjectNode("none", true);
		const none = await svc.funnelView(true);
		expect(none.filter).toMatchObject({ title: "No project", menu: null, project: null });
		expect(none.view.modes.map((m) => m.mode)).toEqual(["twoColumns", "allColumns", "rows"]);
		await svc.pickProjectNode("all", true);
		expect((await svc.funnelView(true)).filter).toMatchObject({ title: "All", project: null });
	});

	it("Done and a done project show by project alone, and give no project", async () => {
		const { svc } = setup();
		await svc.pickProjectNode("done", true);
		const done = await svc.funnelView(true);
		expect(done.view).toMatchObject({ mode: "byProject", wheel: false });
		expect(done.view.modes.map((m) => m.mode)).toEqual(["byProject"]);
		await svc.selectProjectNode("project:Самолёт");
		expect((await svc.funnelView(true)).filter).toMatchObject({ title: "Самолёт", project: null });
		expect((await svc.funnelView(true)).view.modes.map((m) => m.mode)).toEqual(["byProject"]);
	});

	it("the panel: the button opens and closes it; a pick on a narrow screen closes it, on a wide one it stays", async () => {
		const { svc } = setup();
		await svc.setProjectsPanel(true);
		await svc.pickProjectNode(STYLE, true);
		expect((await svc.funnelView(true)).panel!.open).toBe(true);
		await svc.pickProjectNode("project:Дружба", false);
		expect((await svc.funnelView(false)).panel!.open).toBe(false);
		await svc.setProjectsPanel(true);
		await svc.pickProjectNode("project:Дружба", false);
		expect((await svc.funnelView(false)).panel!.open).toBe(true);
		await svc.setProjectsPanel(false);
		expect((await svc.funnelView(true)).panel!.open).toBe(false);
	});

	it("a tap on All with nothing chosen chooses it; a deleted project's filter goes", async () => {
		const { svc } = setup();
		await svc.pickProjectNode("all", true);
		expect((await svc.funnelView(true)).filter?.node).toBe("all");
		await svc.pickProjectNode("project:Дружба", true);
		await svc.deleteProject("Дружба");
		expect((await svc.funnelView(true)).filter).toBeNull();
	});

	it("a held card over a row opens it as the panel draws it: nothing chosen, a project opens", async () => {
		const { svc } = setup();
		await svc.hoverProjectNode("project:Дружба");
		expect((await svc.funnelView(true)).filter?.node).toBe("project:Дружба");
	});

	it("without a tasks file: no filter, the panel's fixed rows", async () => {
		const view = await setup(null as unknown as string).svc.funnelView(true);
		expect(view.filter).toBeNull();
		expect(view.panel).toMatchObject({ missing: true });
		expect(view.panel!.rows.map((r) => r.title)).toEqual(["All", "No project", "Done"]);
	});
});

describe("a project note's block", () => {
	it("is the view of the project the note is attached to: rows, no panel, no cross", async () => {
		const { svc } = setup();
		const view = await svc.projectNoteView("Заметки/Стиль.md", true);
		expect(view).toMatchObject({ filter: { node: STYLE, title: "Стиль, внешность", clearable: false }, panel: null, view: { mode: "rows", wheel: false } });
		expect(view!.view.modes.map((m) => m.mode)).toEqual(["rows", "byProject"]);
		await svc.setNoteViewMode("byProject");
		expect((await svc.projectNoteView("заметки/стиль.md", false))!.view.mode).toBe("byProject");
		expect((await svc.funnelView(true)).view.mode).toBe("twoColumns");
	});

	it("is none for a note no project has", async () => {
		const { svc } = setup();
		expect(await svc.projectNoteView("Заметки/Другое.md", true)).toBeNull();
		expect(await svc.projectNoteView("Стиль.md", true)).toBeNull();
	});
});

describe("by project", () => {
	it("reads a node's parts whatever the device chose, and drops and types in them", async () => {
		const { svc, store } = setup();
		await svc.setProjectsMode("byStage");
		const view = await svc.projectsScreen(STYLE);
		expect(view).toMatchObject({ selected: STYLE, mode: "byProject" });
		expect(view.sections.map((s) => s.title)).toEqual([null, "Гардероб"]);
		const shoes = view.sections[1].cards[0];
		const keys = await svc.dropInProjects([shoes.drop], { kind: "task", group: null, before: null }, STYLE);
		expect(keys).toHaveLength(1);
		expect(store.text).toContain("- [ ] Купить кроссовки 🗂️ Стиль, внешность\n");
		await svc.createInPlace("Шляпа", null, { kind: "projects", group: "project:Гардероб", before: null, node: STYLE }, null, [], "Гардероб");
		expect(store.text).toContain("- [ ] Шляпа 🗂️ Гардероб\n");
		expect((await svc.projectsScreen()).selected).toBe("all");
	});
});

describe("the funnel's places", () => {
	it("walk Inbox, Soon, the calendar and the days after; Done goes on to Inbox, nothing before Inbox", () => {
		expect(FUNNEL_PLACES).toEqual(["inbox", "soon", "calendar"]);
		expect(stepFunnel({ mode: "inbox", date: T }, -1, T)).toBeNull();
		expect(stepFunnel({ mode: "inbox", date: T }, 1, T)).toEqual({ mode: "soon", date: T });
		expect(stepFunnel({ mode: "done", date: T }, 1, T)).toEqual({ mode: "inbox", date: T });
		expect(stepFunnel({ mode: "done", date: T }, -1, T)).toBeNull();
		expect(stepFunnel({ mode: "calendar", date: T }, 1, T)).toEqual({ mode: "calendar", date: "2026-11-13" });
		expect(stepFunnel({ mode: "calendar", date: T }, -1, T)).toEqual({ mode: "soon", date: T });
	});

	it("a list shows at its place, else the nearest; the lists a field stands in follow the mode", () => {
		expect(funnelPlaceShowing("day", "inbox")).toBe("soon");
		expect(funnelPlaceShowing("backlog", "calendar")).toBe("inbox");
		expect(funnelPlaceShowing("soon", "done")).toBe("inbox");
		expect(viewEntryLists("twoColumns", "soon")).toEqual(["soon", "day"]);
		expect(viewEntryLists("twoColumns", "done")).toEqual(["inbox", "backlog", "soon"]);
		expect(viewEntryLists("rows", "calendar")).toEqual(["inbox", "backlog", "soon", "day"]);
		expect(viewEntryLists("allColumns", "inbox")).toEqual(["inbox", "backlog", "soon", "day"]);
		expect(viewEntryLists("byProject", "inbox")).toEqual(["projects"]);
	});
});

describe("the quick entry under a filter", () => {
	it("starts a new task's field with the filter's project and writes it where the filtered list shows it", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T, STYLE);
		const cards = screen.inbox.map((item) => ({ key: item.key, id: item.id, level: 0, group: null }));
		const look: EntryLook = {
			cards: (column) => (column === "inbox" ? cards : []),
			sections: () => [],
			sectioned: () => false,
			day: () => T,
			today: () => T,
			shown: () => ["inbox", "backlog", "soon", "day"],
			filter: () => ({ node: STYLE, project: "Стиль, внешность" }),
		};
		let line = Promise.resolve();
		const writes = {
			push: (job: () => Promise<void>) => void (line = line.then(job)),
			idle: async () => {
				for (let last = line; ; last = line) {
					await last;
					if (last === line) return;
				}
			},
		};
		const session = new QuickEntrySession(svc, { ...look, fresh: async (before) => before?.(() => []), onChange: () => undefined }, writes);
		session.openAtEnd("inbox");
		expect(session.state?.project?.lit).toBe(true);
		session.type("Новая стрижка");
		session.enter();
		await session.idle();
		expect(store.text).toContain("- [ ] Купить кроссовки 🗂️ Гардероб\n- [ ] Новая стрижка 🗂️ Стиль, внешность\n- [ ] Позвонить другу");
	});
});

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
import { hoverRow } from "../fakes/projectsHover";

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

	/** Max, 2026-11-12: All is all tasks, no filter. */
	it("All: every task, as no filter; No project: every task without; Done: the done projects' tasks", async () => {
		const { svc } = setup();
		expect(lists(await svc.screen(T, "all"))).toEqual(lists(await svc.screen(T)));
		expect(lists(await svc.screen(T, "none"))).toEqual({ inbox: ["Без проекта"], backlog: [], soon: ["Записаться к врачу"], day: ["Утренняя зарядка"], done: [] });
		expect(lists(await svc.screen(T, "done"))).toEqual({ inbox: [], backlog: [], soon: [], day: [], done: ["Купить билет"] });
		expect((await svc.screen(T, "all")).inbox[0].project?.mark).toBe(true);
	});

	it("the day's view takes the filter too", async () => {
		const { svc } = setup();
		expect(titles((await svc.dayView(T, "none")).list)).toEqual(["Утренняя зарядка"]);
		expect((await svc.dayView(T, STYLE)).list).toEqual([]);
		expect((await svc.dayView(T, STYLE))).toEqual((await svc.screen(T, STYLE)).day);
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

describe("a card let go on the project it already has", () => {
	it("leaves its line as it is, from the funnel with no filter, under a filter, and from the Projects list", async () => {
		const { svc, store } = setup();
		const before = store.text;
		const glasses = () => svc.screen(T).then((s) => s.inbox.find((i) => i.title === "Подобрать очки")!);
		await svc.dropTasksOnProject([(await glasses()).key], STYLE, null);
		expect(store.text).toBe(before);
		await svc.dropTasksOnProject([(await glasses()).key], STYLE, STYLE);
		expect(store.text).toBe(before);
		await svc.dropTasksOnProject([(await glasses()).key], "project:стиль, ВНЕШНОСТЬ", "all");
		expect(store.text).toBe(before);
		const card = (await svc.projectsScreen(STYLE)).sections[0].cards.find((c) => c.item.title === "Подобрать очки")!;
		await svc.dropOnProject([card.drop], STYLE);
		expect(store.text).toBe(before);
		const loose = (await svc.screen(T)).inbox.find((i) => i.title === "Без проекта")!;
		await svc.dropTasksOnProject([loose.key], "none", null);
		expect(store.text).toBe(before);
	});
});

describe("a find the filter hides", () => {
	it("is told by the core: a task, a subtask by its task, a timeline task, a done one; nothing hides without a filter", async () => {
		const text = FILE.replace("- [ ] Утренняя зарядка", "- [ ] Утренняя зарядка\n- [ ] Созвон ⏰ 2026-11-12 15:00-16:00 🗂️ Дружба");
		const { svc } = setup(text);
		const screen = await svc.screen(T);
		const items = [...screen.inbox, ...screen.soon, ...screen.soon.flatMap((i) => i.subtasks), ...screen.day.slotted, ...screen.done];
		const hits = new Map(items.map((i) => [i.title, i]));
		expect(await svc.filterHides(hits.get("Подобрать очки")!, STYLE)).toBe(false);
		expect(await svc.filterHides(hits.get("Без проекта")!, STYLE)).toBe(true);
		expect(await svc.filterHides(hits.get("Почитать отзывы")!, STYLE)).toBe(false);
		expect(await svc.filterHides(hits.get("Почитать отзывы")!, "none")).toBe(true);
		expect(await svc.filterHides(hits.get("Созвон")!, "project:Дружба")).toBe(false);
		expect(await svc.filterHides(hits.get("Созвон")!, STYLE)).toBe(true);
		expect(await svc.filterHides(hits.get("Купить билет")!, "done")).toBe(false);
		expect(await svc.filterHides(hits.get("Купить билет")!, null)).toBe(false);
		expect(await svc.filterHides(hits.get("Без проекта")!, "project:Нет такого")).toBe(false);
	});
});

describe("the No tasks plate", () => {
	it("shows in an empty list under a filter and in rows; in columns without a filter no list has one", async () => {
		const { svc } = setup();
		const none = { inbox: null, backlog: null, soon: null, day: null };
		const words = { inbox: "No tasks", backlog: "No tasks", soon: "No tasks", day: "No tasks" };
		expect((await svc.funnelView(true)).view.plates).toEqual(none);
		await svc.setViewMode("rows");
		expect((await svc.funnelView(true)).view.plates).toEqual(words);
		await svc.setViewMode("allColumns");
		expect((await svc.funnelView(true)).view.plates).toEqual(none);
		await svc.pickProjectNode(STYLE, true);
		await svc.setViewMode("twoColumns");
		expect((await svc.funnelView(true)).view.plates).toEqual(words);
		expect((await svc.projectNoteView("Заметки/Стиль.md", true))!.view.plates).toEqual(words);
	});
});

describe("the view before the first read", () => {
	it("is the device's: two columns at first, the kept mode with a node chosen or not, rows in a note", async () => {
		const { svc } = setup();
		expect(svc.firstView(true, false)).toMatchObject({ mode: "twoColumns", wheel: true });
		expect(svc.firstView(false, true)).toMatchObject({ mode: "rows" });
		await svc.setViewMode("allColumns");
		expect(svc.firstView(true, false).mode).toBe("allColumns");
		expect(svc.firstView(false, false).mode).toBe("twoColumns");
		await svc.pickProjectNode(STYLE, true);
		expect(svc.firstView(true, false).mode).toBe("allColumns");
		expect(svc.firstView(true, false)).toEqual((await svc.funnelView(true)).view);
	});
});

describe("the funnel's view", () => {
	it("starts with no filter, two columns with the wheel, the panel closed and All's row chosen", async () => {
		const view = await setup().svc.funnelView(true);
		expect(view.filter).toBeNull();
		expect(view.view).toMatchObject({ mode: "twoColumns", icon: "columns-2", wheel: true, rows: [], emptyLabel: "No tasks" });
		expect(view.view.modes.map((m) => [m.mode, m.label, m.checked])).toEqual([
			["twoColumns", "Two columns", true],
			["allColumns", "All columns", false],
			["rows", "Rows", false],
			["byProject", "By project", false],
		]);
		expect(view.panel).toMatchObject({ open: false, docked: true, missing: false });
		expect(view.panel!.rows.filter((r) => r.selected).map((r) => r.node)).toEqual(["all"]);
		expect(view.panel!.rows.map((r) => r.title)).toEqual(["All", "Стиль, внешность", "Гардероб", "Дружба", "No project", "Done"]);
	});

	it("on a narrow screen: Columns and Rows, no All columns, the panel over the lists", async () => {
		const view = await setup().svc.funnelView(false);
		expect(view.view.modes.map((m) => [m.mode, m.label])).toEqual([
			["twoColumns", "Columns"],
			["rows", "Rows"],
			["byProject", "By project"],
		]);
		expect(view.panel!.docked).toBe(false);
	});

	it("a pick filters by the node: its title and menu, the cross, the mode kept and By project offered", async () => {
		const { svc } = setup();
		await svc.pickProjectNode(STYLE, true);
		const view = await svc.funnelView(true);
		expect(view.filter).toMatchObject({ node: STYLE, title: "Стиль, внешность", clearable: true, project: "Стиль, внешность", emptyLabel: "No tasks" });
		expect(view.filter!.menu?.project.name).toBe("Стиль, внешность");
		expect(view.view).toMatchObject({ mode: "twoColumns", wheel: true, icon: "columns-2", rows: [] });
		await svc.setViewMode("rows");
		expect((await svc.funnelView(true)).view).toMatchObject({ mode: "rows", wheel: false, icon: "rows-3", rows: ["inbox", "backlog", "soon", "day"] });
		expect(view.view.modes.map((m) => m.mode)).toEqual(["twoColumns", "allColumns", "rows", "byProject"]);
		expect(view.panel!.rows.filter((r) => r.selected).map((r) => r.title)).toEqual(["Стиль, внешность"]);
	});

	/** Max, 2026-11-12: the view mode is one choice, «независимое решение»; picking or clearing a project never changes it. */
	it("keeps one mode: only the view button changes it, never a pick or a clear", async () => {
		const { svc, state } = setup();
		await svc.setViewMode("allColumns");
		await svc.pickProjectNode(STYLE, true);
		expect((await svc.funnelView(true)).view.mode).toBe("allColumns");
		await svc.clearProjectFilter();
		expect((await svc.funnelView(true)).view.mode).toBe("allColumns");
		await svc.pickProjectNode(STYLE, true);
		await svc.setViewMode("rows");
		await svc.clearProjectFilter();
		expect((await svc.funnelView(true)).view.mode).toBe("rows");
		expect(state.get().view).toBe("rows");
		expect((await svc.funnelView(false)).view.mode).toBe("rows");
	});

	/** Max, 2026-11-12: mode and project are independent; every mode stands under every filter. */
	it("by project stays when the filter is cleared: every shown task by its top project, No project last", async () => {
		const { svc } = setup();
		await svc.pickProjectNode(STYLE, true);
		await svc.setViewMode("byProject");
		await svc.clearProjectFilter();
		expect((await svc.funnelView(true)).view).toMatchObject({ mode: "byProject", chosen: "byProject", source: "projectsScreen" });
		const parts = (await svc.projectsScreen()).sections;
		expect(parts.map((p) => [p.title, p.cards.map((c) => c.item.title)])).toEqual([
			["Стиль, внешность", ["Подобрать очки", "Купить кроссовки", "Найти барбершоп"]],
			["Дружба", ["Позвонить другу"]],
			["No project", ["Без проекта", "Записаться к врачу", "Утренняя зарядка"]],
		]);
	});

	it("by project under All, which is no filter, as without one; under No project its one part", async () => {
		const { svc } = setup();
		await svc.setViewMode("byProject");
		await svc.pickProjectNode("all", true);
		expect((await svc.funnelView(true)).view).toMatchObject({ mode: "byProject" });
		expect((await svc.funnelView(true)).filter).toBeNull();
		expect((await svc.projectsScreen("all")).sections.map((p) => p.title)).toEqual(["Стиль, внешность", "Дружба", "No project"]);
		expect((await svc.projectsScreen("all")).sections).toEqual((await svc.projectsScreen()).sections);
		expect((await svc.projectsScreen("none")).sections.flatMap((p) => p.cards.map((c) => c.item.title))).toEqual(["Без проекта", "Записаться к врачу", "Утренняя зарядка"]);
		await svc.pickProjectNode("none", true);
		expect((await svc.funnelView(true)).view.mode).toBe("byProject");

	});

	it("reads a device's old state with a filtered mode as the one mode, and drops it once a mode is picked", async () => {
		const { svc, state } = setup();
		state.set({ selected: STYLE, view: "allColumns", filteredView: "byProject" } as never);
		expect((await svc.funnelView(true)).view.mode).toBe("allColumns");
		await svc.setViewMode("rows");
		expect(state.get()).not.toHaveProperty("filteredView");
		expect(state.get().view).toBe("rows");
	});

	it("names its context, the filter and the mode: another context is drawn still, the same one changed moves", async () => {
		const { svc } = setup();
		const plain = (await svc.funnelView(true)).view.context;
		expect((await svc.funnelView(true)).view.context).toBe(plain);
		await svc.pickProjectNode(STYLE, true);
		const style = (await svc.funnelView(true)).view.context;
		expect(style).not.toBe(plain);
		await svc.setViewMode("rows");
		const rows = (await svc.funnelView(true)).view.context;
		expect(rows).not.toBe(style);
		expect(svc.firstView(true, false).context).toBe(rows);
		const note = (await svc.projectNoteView("Заметки/Стиль.md", true))!.view.context;
		expect(note).not.toBe(rows);
		expect(svc.firstView(true, true).context).toBe(note);
	});

	it("carries its layout: two columns turned by pages, rows standing still", async () => {
		const { svc } = setup();
		expect((await svc.funnelView(true)).view.layout).toMatchObject({ mode: "twoColumns", swipe: "pages" });
		expect((await svc.funnelView(true)).view.layout.columns[0].lists.map((l) => l.title)).toEqual(["Inbox", "Backlog"]);
		await svc.setViewMode("rows");
		expect((await svc.funnelView(true)).view.layout).toMatchObject({ mode: "rows", swipe: "none", stack: { scrolls: true } });
		expect((await svc.projectNoteView("Заметки/Стиль.md", true))!.view.layout).toMatchObject({ swipe: "none", divider: false, stack: { scrolls: false } });
	});

	it("All and No project have no menu and give no project; every mode offered", async () => {
		const { svc } = setup();
		await svc.pickProjectNode("none", true);
		const none = await svc.funnelView(true);
		expect(none.filter).toMatchObject({ title: "No project", menu: null, project: null });
		expect(none.view.modes.map((m) => m.mode)).toEqual(["twoColumns", "allColumns", "rows", "byProject"]);
		await svc.pickProjectNode("all", true);
		expect((await svc.funnelView(true)).filter).toBeNull();
	});

	it("Done and a done project draw their done list in any mode; the button keeps the mode chosen", async () => {
		const { svc } = setup();
		await svc.setViewMode("rows");
		await svc.pickProjectNode("done", true);
		const done = await svc.funnelView(true);
		expect(done.view).toMatchObject({ mode: "byProject", chosen: "rows", icon: "rows-3", wheel: false, ribbon: false, source: "projectsScreen", rows: [] });
		expect(done.view.layout).toMatchObject({ mode: "byProject", swipe: "none" });
		expect(done.view.modes.map((m) => [m.mode, m.checked])).toEqual([["twoColumns", false], ["allColumns", false], ["rows", true], ["byProject", false]]);
		await svc.setViewMode("twoColumns");
		expect((await svc.funnelView(true)).view).toMatchObject({ mode: "byProject", chosen: "twoColumns", icon: "columns-2" });
		await svc.selectProjectNode("project:Самолёт");
		expect((await svc.funnelView(true)).filter).toMatchObject({ title: "Самолёт", project: null });
		expect((await svc.funnelView(true)).view).toMatchObject({ mode: "byProject", chosen: "twoColumns" });
		await svc.clearProjectFilter();
		expect((await svc.funnelView(true)).view).toMatchObject({ mode: "twoColumns", chosen: "twoColumns" });
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

	/** Max, 2026-11-12: All is no filter: its row is lit while nothing is chosen, and a tap on it clears the filter. */
	it("a tap on All clears the filter and lights All's row; a narrow panel closes; an old All kept reads as none", async () => {
		const { svc, state } = setup();
		await svc.pickProjectNode(STYLE, true);
		await svc.setProjectsPanel(true);
		await svc.pickProjectNode("all", false);
		const view = await svc.funnelView(false);
		expect(view.filter).toBeNull();
		expect(view.panel).toMatchObject({ open: false });
		expect(view.panel!.rows.filter((r) => r.selected).map((r) => r.node)).toEqual(["all"]);
		expect(state.get().selected).toBeUndefined();
		await svc.selectProjectNode("all");
		expect(state.get().selected).toBeUndefined();
		state.set({ selected: "all" });
		expect((await svc.funnelView(true)).filter).toBeNull();
		expect(svc.firstView(true, false).context).toBe((await svc.funnelView(true)).view.context);
		await svc.pickProjectNode("project:Дружба", true);
		expect((await svc.funnelView(true)).filter?.node).toBe("project:Дружба");
		await svc.pickProjectNode("project:Дружба", true);
		await svc.deleteProject("Дружба");
		expect((await svc.funnelView(true)).filter).toBeNull();
	});

	it("a held card over a row opens it as the panel draws it: nothing chosen, a project opens", async () => {
		const { svc } = setup();
		await hoverRow(svc, "project:Дружба");
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
		const view = await svc.projectsScreen(STYLE);
		expect(view).toMatchObject({ selected: STYLE });
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
		expect(session.state?.locksPanel).toBe(true);
		session.type("Новая стрижка");
		session.enter();
		await session.idle();
		expect(store.text).toContain("- [ ] Купить кроссовки 🗂️ Гардероб\n- [ ] Новая стрижка 🗂️ Стиль, внешность\n- [ ] Позвонить другу");
	});
});

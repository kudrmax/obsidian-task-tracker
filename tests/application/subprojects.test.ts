import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-12";
const clock: Clock = { now: () => new Date(2026, 10, 12, 12, 0) };

/** Max's case (11-12): «Люди» with subprojects; he wants to see the parent's own tasks alone. */
const FILE = [
	"## Inbox",
	"",
	"- [ ] Позвать всех на ужин 🗂️ Люди",
	"- [ ] Написать Пете 🗂️ Друзья",
	"- [ ] Без проекта",
	"- [ ] Подарок маме 🗂️ Семья 🗂️ Люди",
	"- [ ] Купить билеты 🗂️ Поездки",
	"",
	"## Projects",
	"",
	"- Люди [[Заметки/Люди]]",
	"\t- Друзья",
	"\t\t- Школа",
	"\t- Семья",
	"- Работа 🗃️",
	"\t- Отчёты",
	"- Поездки",
	"",
	"## Now",
	"",
	"- [ ] Созвон ⏰ 2026-11-12 15:00-16:00 🗂️ Друзья",
	"- [ ] Встреча ⏰ 2026-11-12 17:00-18:00 🗂️ Люди",
	"",
	"## Soon",
	"",
	"- [ ] Встретиться с классом 🗂️ Школа",
	"\t- [ ] Найти контакты",
	"- [ ] Отчёт за квартал 🗂️ Отчёты",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
	"",
].join("\n");

const PEOPLE = "project:Люди";

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const state = memoryProjectsScreen();
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, state);
	return { store, svc, state };
}

const titles = (items: readonly TaskItem[]) => items.map((i) => i.title);
const lists = (s: ScreenView) => ({ inbox: titles(s.inbox), soon: titles(s.soon), day: titles(s.day.list), slotted: titles(s.day.slotted) });

describe("the Subprojects row of the view menu", () => {
	it("shows, checked, while the chosen node is a project with subprojects; else there is none", async () => {
		const { svc } = setup();
		expect((await svc.funnelView(true)).view.subprojects).toBeNull();
		await svc.pickProjectNode(PEOPLE, true);
		expect((await svc.funnelView(true)).view.subprojects).toEqual({ label: "Subprojects", checked: true });
		await svc.pickProjectNode("project:Поездки", true);
		expect((await svc.funnelView(true)).view.subprojects).toBeNull();
		await svc.pickProjectNode("project:Работа", true);
		expect((await svc.funnelView(true)).view.subprojects).toBeNull();
		for (const node of ["all", "none", "done"]) {
			await svc.pickProjectNode(node, true);
			expect((await svc.funnelView(true)).view.subprojects).toBeNull();
		}
	});

	it("a toggle turns it off and on, and never changes the mode, the filter or the panel", async () => {
		const { svc } = setup();
		await svc.pickProjectNode(PEOPLE, true);
		await svc.setViewMode("twoColumns");
		const before = await svc.funnelView(true);
		await svc.toggleSubprojects();
		const after = await svc.funnelView(true);
		expect(after.view.subprojects).toEqual({ label: "Subprojects", checked: false });
		expect(after.view.mode).toBe("twoColumns");
		expect(after.filter).toEqual(before.filter);
		expect(after.panel).toEqual(before.panel);
		await svc.toggleSubprojects();
		expect((await svc.funnelView(true)).view.subprojects?.checked).toBe(true);
	});

	it("stands in every mode, By project too, and its check off is another context, drawn still like another filter", async () => {
		const { svc } = setup();
		await svc.pickProjectNode(PEOPLE, true);
		for (const mode of ["twoColumns", "allColumns", "rows", "byProject"] as const) {
			await svc.setViewMode(mode);
			const on = (await svc.funnelView(true)).view;
			expect(on.subprojects).toEqual({ label: "Subprojects", checked: true });
			await svc.toggleSubprojects();
			const off = (await svc.funnelView(true)).view;
			expect(off.subprojects?.checked).toBe(false);
			expect(off.mode).toBe(mode);
			expect(off.context).not.toBe(on.context);
			await svc.toggleSubprojects();
			expect((await svc.funnelView(true)).view.context).toBe(on.context);
		}
	});

	it("is kept on the device: choosing, clearing and choosing again leave it as it was", async () => {
		const { svc, state } = setup();
		await svc.pickProjectNode(PEOPLE, true);
		await svc.toggleSubprojects();
		expect(state.get().subprojects).toBe(false);
		await svc.pickProjectNode("project:Поездки", true);
		await svc.clearProjectFilter();
		await svc.setViewMode("rows");
		await svc.pickProjectNode(PEOPLE, true);
		expect((await svc.funnelView(true)).view.subprojects?.checked).toBe(false);
		expect(svc.firstView(true, false).subprojects).toEqual({ label: "Subprojects", checked: false });
	});

	it("counts only subprojects that aren't done, as the panel draws the branch; a done project counts its done ones", async () => {
		const text = FILE.replace("- Поездки\n", "- Поездки\n\t- Рим\n").replace("## Done\n\n", "## Done\n\n- [x] Билеты в Рим 🗂️ Рим\n- [x] Отпуск 🗂️ Архив\n- [x] Старый план 🗂️ Черновики\n").replace("\t- Рим\n", "\t- Рим\n- Архив\n\t- Черновики\n");
		const { svc } = setup(text);
		await svc.pickProjectNode("project:Поездки", true);
		const trips = await svc.funnelView(true);
		expect(trips.panel!.rows.find((r) => r.title === "Поездки")!.hasBranch).toBe(false);
		expect(trips.view.subprojects).toBeNull();
		await svc.pickProjectNode("project:Архив", true);
		expect((await svc.funnelView(true)).view.subprojects).toEqual({ label: "Subprojects", checked: true });
	});

	it("shows in a project note's block too, the same setting", async () => {
		const { svc } = setup();
		expect((await svc.projectNoteView("Заметки/Люди.md", true))!.view.subprojects).toEqual({ label: "Subprojects", checked: true });
		await svc.toggleSubprojects();
		expect((await svc.projectNoteView("Заметки/Люди.md", true))!.view.subprojects?.checked).toBe(false);
	});
});

describe("Subprojects off", () => {
	it("on (the default): the chosen project shows its whole branch", async () => {
		const { svc } = setup();
		expect(lists(await svc.screen(T, PEOPLE))).toEqual({
			inbox: ["Позвать всех на ужин", "Написать Пете", "Подарок маме"],
			soon: ["Встретиться с классом"],
			day: [],
			slotted: ["Созвон", "Встреча"],
		});
	});

	it("off: only the tasks whose own projects include the chosen one, in every list and the timeline", async () => {
		const { svc } = setup();
		await svc.toggleSubprojects();
		expect(lists(await svc.screen(T, PEOPLE))).toEqual({ inbox: ["Позвать всех на ужин", "Подарок маме"], soon: [], day: [], slotted: ["Встреча"] });
		expect(titles((await svc.dayView(T, PEOPLE)).slotted)).toEqual(["Встреча"]);
	});

	it("off changes nothing for a project without subprojects, a folder, All, No project and no filter", async () => {
		const { svc } = setup();
		const on = await Promise.all([undefined, "project:Поездки", "project:Работа", "all", "none"].map(async (f) => lists(await svc.screen(T, f))));
		await svc.toggleSubprojects();
		const off = await Promise.all([undefined, "project:Поездки", "project:Работа", "all", "none"].map(async (f) => lists(await svc.screen(T, f))));
		expect(off).toEqual(on);
		expect(on[2].soon).toEqual(["Отчёт за квартал"]);
	});

	it("off: a find of a subproject's task is hidden by the filter, a subtask by its task", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const hits = new Map([...screen.inbox, ...screen.soon, ...screen.soon.flatMap((i) => i.subtasks), ...screen.day.slotted].map((i) => [i.title, i]));
		expect(await svc.filterHides(hits.get("Написать Пете")!, PEOPLE)).toBe(false);
		await svc.toggleSubprojects();
		expect(await svc.filterHides(hits.get("Написать Пете")!, PEOPLE)).toBe(true);
		expect(await svc.filterHides(hits.get("Найти контакты")!, PEOPLE)).toBe(true);
		expect(await svc.filterHides(hits.get("Созвон")!, PEOPLE)).toBe(true);
		expect(await svc.filterHides(hits.get("Подарок маме")!, PEOPLE)).toBe(false);
		expect(await svc.filterHides(hits.get("Написать Пете")!, "project:Друзья")).toBe(false);
	});

	it("off: by project shows only the project's own part", async () => {
		const { svc } = setup();
		expect((await svc.projectsScreen(PEOPLE)).sections.map((s) => s.title)).toEqual([null, "Друзья", "Школа", "Семья"]);
		await svc.toggleSubprojects();
		const view = await svc.projectsScreen(PEOPLE);
		expect(view.sections.map((s) => s.title)).toEqual([null]);
		expect(view.sections[0].cards.map((c) => c.item.title)).toEqual(["Позвать всех на ужин", "Подарок маме", "Встреча"]);
	});

	it("off: a card shown under the chosen project gives the chosen one way when dropped on a row", async () => {
		const { svc, store } = setup();
		await svc.toggleSubprojects();
		const gift = (await svc.screen(T, PEOPLE)).inbox.find((i) => i.title === "Подарок маме")!;
		await svc.dropTasksOnProject([gift.key], "project:Поездки", PEOPLE);
		expect(store.text).toContain("- [ ] Подарок маме 🗂️ Семья 🗂️ Поездки\n");
	});

	it("off: a task typed at a list's end goes after the last task the screen shows", async () => {
		const { svc, store } = setup();
		await svc.toggleSubprojects();
		await svc.createInPlace("Новая", null, { kind: "list", list: "inbox", group: null, before: null }, null, [], "Люди", PEOPLE);
		expect(store.text).toContain("- [ ] Подарок маме 🗂️ Семья 🗂️ Люди\n- [ ] Новая 🗂️ Люди\n- [ ] Купить билеты");
	});
});

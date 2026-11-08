import { describe, expect, it } from "vitest";
import type { Clock } from "../../core/application/ports";
import { memoryGrouping } from "../../core/application/ports";
import { hasProjectTag, NO_PROJECT, projectNotesOf } from "../../core/application/projects";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import type { ProjectNote } from "../../core/application/contracts";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-07";
const LATER = "2026-11-10";
const clock: Clock = { now: () => new Date(2026, 10, 7, 14, 20) };
const NOTES: readonly ProjectNote[] = [
	{ name: "Окружение", path: "Окружение.md", link: "Окружение" },
	{ name: "Английский", path: "Учёба/Английский.md", link: "Английский" },
];
const FILE = [
	"## Inbox",
	"- [ ] I 🗂️ [[Окружение]]",
	"## Now",
	"- [ ] N 🗂️ [[Окружение]]",
	"## Soon",
	"- [ ] S",
	"- [ ] S2 🗂️ [[Окружение]]",
	"## Backlog",
	"- [ ] B1 🗂️ [[Окружение]]",
	"\t- [ ] B1a",
	"- [ ] B2",
	"### Дальний",
	"- [ ] B3 🗂️ [[Окружение]]",
	"- [ ] B4 🗂️ [[Старый]]",
	"### Пустой",
	"## Done",
	"- [x] D 🗂️ [[Окружение]]",
	"",
].join("\n");

function setup(text = FILE, notes = NOTES) {
	const store = new InMemoryTaskFileStore(text);
	const grouping = memoryGrouping();
	const projects = { list: () => notes, onChange: () => () => undefined };
	return { store, grouping, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, grouping) };
}

describe("which notes are projects", () => {
	it("exactly the setting's tag, in properties or text, case aside; not a nested child", () => {
		expect(hasProjectTag(["#Project"], "#project")).toBe(true);
		expect(hasProjectTag(["project"], "#project")).toBe(true);
		expect(hasProjectTag(["#project/sub"], "#project")).toBe(false);
		expect(projectNotesOf([{ name: "B", path: "B.md", link: "B", tags: ["#project"] }, { name: "A", path: "A.md", link: "A", tags: ["#project"] }, { name: "C", path: "C.md", link: "C", tags: [] }], "#project").map((n) => n.name)).toEqual(["A", "B"]);
	});
});

describe("a task's project on the screen", () => {
	it("a card knows its project, a subtask its parent's; a note gone keeps the name, without the arrow", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const b1 = screen.backlog[0];
		expect(b1.project).toEqual({ name: "Окружение", link: "Окружение", note: "Окружение.md", canOpenNote: true, mark: true });
		expect(b1.allSubtasks[0].project?.name).toBe("Окружение");
		expect(b1.can.setProject).toBe(true);
		expect(b1.allSubtasks[0].can.setProject).toBe(false);
		expect(screen.backlog[3].project).toEqual({ name: "Старый", link: "Старый", note: null, canOpenNote: false, mark: true });
		expect(b1.title).toBe("B1");
	});
});

describe("Backlog grouped by project", () => {
	it("on by default in Backlog, off in Soon; Inbox and Now never group", async () => {
		const { projects } = await setup().svc.screen(T);
		expect([projects.backlog.on, projects.soon.on, projects.inbox.canGroup, projects.now.canGroup, projects.soon.canGroup]).toEqual([true, false, false, false, true]);
	});

	it("a group per project by name (every project note, empty ones too), then No project; sections inside", async () => {
		const { projects } = await setup().svc.screen(T);
		const groups = projects.backlog.groups;
		expect(groups.map((g) => [g.title, g.count, g.canOpenNote, g.zone])).toEqual([
			["Английский", 0, true, "Английский"],
			["Окружение", 2, true, "Окружение"],
			["Старый", 1, false, "Старый"],
			[NO_PROJECT, 1, false, null],
		]);
		const own = groups[1];
		expect(own.sections.map((s) => [s.name, s.header, s.reorder, s.items.map((i) => i.text), s.menu])).toEqual([
			[null, false, false, ["B1"], null],
			["Дальний", true, false, ["B3"], { section: "Дальний", rename: true, remove: true, project: "Окружение" }],
		]);
		expect(own.end).toEqual({ kind: "task", group: "Дальний", before: null, project: "Окружение" });
		expect(groups[0].sections).toEqual([{ name: null, items: [], rows: [], empty: true, menu: null, header: false, reorder: false }]);
		expect(groups[3].sections.map((s) => [s.name, s.empty])).toEqual([
			[null, false],
			["Пустой", true],
		]);
	});

	it("Soon grouped shows only the projects with tasks there; a fold is kept and counted", async () => {
		const { svc } = setup();
		await svc.setGrouping("soon", true);
		await svc.toggleFold("soon", "окружение");
		const { projects } = await svc.screen(T);
		expect(projects.soon.groups.map((g) => [g.title, g.folded, g.count])).toEqual([
			["Окружение", true, 1],
			[NO_PROJECT, false, 1],
		]);
	});

	it("a menu in a grouped list offers the sections of the task's group", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const menu = svc.menu(screen.backlog[0], "backlog", { today: T, day: T, offer: screen.offer });
		expect(menu.sections?.options.map((o) => o.name)).toEqual(["Дальний", "Morning", "Afternoon", "Evening", null]);
	});
});

describe("the Project page", () => {
	it("the project notes by name, a task's own unknown one after them, No project; disabled for a subtask", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const at = { today: T, day: T, offer: screen.offer };
		const old = svc.menu(screen.backlog[3], "backlog", at).project;
		expect(old.options.map((o) => [o.project.name, o.checked])).toEqual([
			["Английский", false],
			["Окружение", false],
			["Старый", true],
		]);
		expect(old.none).toBe(false);
		expect(svc.menu(screen.backlog[1], "backlog", at).project).toMatchObject({ current: null, none: true, noneName: "No project", value: "No project", disabled: false });
		expect(svc.menu(screen.backlog[0].allSubtasks[0], "stack", at).project).toMatchObject({ current: { name: "Окружение" }, disabled: true });
		const bulk = svc.bulkMenu([{ item: screen.backlog[0], from: "backlog" }, { item: screen.backlog[1], from: "backlog" }], at).project;
		expect(bulk).toMatchObject({ current: null, none: false, disabled: false });
	});

	it("setProject writes the field on each task, in one write; a subtask follows its parent", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const writes = store.writes;
		await svc.setProject([screen.backlog[1].key, screen.backlog[0].allSubtasks[0].key], "Английский");
		expect(store.writes).toBe(writes + 1);
		expect(store.text).toContain("- [ ] B2 🗂️ [[Английский]]");
		expect(store.text).toContain("\t- [ ] B1a\n");
	});
});

describe("search", () => {
	it("finds a task by its project's name", async () => {
		const found = await setup().svc.search("окруж");
		const backlog = found.find((g) => g.list === "backlog")!;
		expect(backlog.hits.map((h) => h.item.text)).toEqual(["B1", "B3"]);
		expect(backlog.hits[0].project).toEqual([
			{ text: "Окруж", match: true },
			{ text: "ение", match: false },
		]);
	});
});

describe("the project's own view", () => {
	it("every list and Done hold only its tasks, without the mark; empty sections go", async () => {
		const screen = await setup().svc.screen(T, "Окружение");
		expect(screen.project).toMatchObject({ name: "Окружение", mark: false });
		expect([screen.inbox, screen.day.list, screen.soon, screen.backlog, screen.done].map((l) => l.map((i) => i.text))).toEqual([["I"], ["N"], ["S2"], ["B1", "B3"], ["D"]]);
		expect(screen.backlog[0].project?.mark).toBe(false);
		expect(screen.sections.backlog.some((s) => s.empty)).toBe(false);
		expect(screen.projects.backlog).toMatchObject({ canGroup: false, on: true });
	});

	it("a drop with no task to stand before goes after the project's last task there", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T, "Окружение");
		await svc.drop([{ key: screen.inbox[0].key, from: "inbox" }], { kind: "place", column: "backlog", place: { kind: "task", group: null, before: null, project: "Окружение" } }, T);
		expect(store.text).toContain("- [ ] B1 🗂️ [[Окружение]]\n\t- [ ] B1a\n- [ ] I 🗂️ [[Окружение]]\n- [ ] B2\n");
	});

	it("a new task gets the project", async () => {
		const { svc, store } = setup();
		await svc.createInPlace("New", null, { kind: "list", list: "soon", group: null, before: null, project: "Окружение" });
		expect(store.text).toContain("- [ ] S2 🗂️ [[Окружение]]\n- [ ] New 🗂️ [[Окружение]]\n");
	});
});

describe("section actions in a project's group", () => {
	it("rename and remove touch only that project's tasks", async () => {
		const { svc, store } = setup();
		expect(await svc.renameGroup("backlog", "Дальний", "Скоро", "Окружение")).toBe(true);
		expect(store.text).toContain("### Скоро\n- [ ] B3 🗂️ [[Окружение]]\n### Дальний\n- [ ] B4 🗂️ [[Старый]]\n");
		await svc.removeGroup("backlog", "Дальний", "Старый");
		expect(store.text).toContain("- [ ] B2\n- [ ] B4 🗂️ [[Старый]]\n### Скоро\n");
	});
});

describe("a found task in a folded group", () => {
	it("unfolds the group it stands in", async () => {
		const { svc, grouping } = setup();
		await svc.toggleFold("backlog", "окружение");
		const screen = await svc.screen(T);
		await svc.reveal(screen.backlog[0]);
		expect(grouping.get().folded?.backlog).toEqual([]);
	});
});

describe("the project's view as one group of the project (decision 25)", () => {
	const SOON = "## Now\n\n## Soon\n\n- [ ] A 🗂️ [[P]]\n- [ ] X\n- [ ] B 🗂️ [[P]]\n- [ ] Y\n\n## Done\n";

	it("every list is one untitled group whose cards, headers, plates and places carry the project", async () => {
		const screen = await setup(FILE).svc.screen(T, "Окружение");
		for (const list of ["inbox", "backlog", "soon", "now"] as const) {
			const grouping = screen.projects[list];
			expect(grouping).toMatchObject({ canGroup: false, on: true });
			expect(grouping.groups).toHaveLength(1);
			expect(grouping.groups[0]).toMatchObject({ titled: false, zone: "Окружение", folded: false, head: { group: null, project: "Окружение" } });
		}
		const backlog = screen.projects.backlog.groups[0].sections;
		expect(backlog.map((s) => [s.name, s.header, s.reorder, s.menu?.project])).toEqual([
			[null, true, false, undefined],
			["Дальний", true, false, "Окружение"],
		]);
	});

	it("an empty list of the view is the group's empty part: «No tasks», where its plate writes", async () => {
		const screen = await setup(FILE).svc.screen(LATER, "Английский");
		const part = screen.projects.inbox.groups[0];
		expect(part.sections).toEqual([{ name: null, items: [], rows: [], empty: true, menu: null, header: false, reorder: false }]);
		expect(part.end).toEqual({ kind: "task", group: null, before: null, project: "Английский" });
	});

	it("the section field there makes no empty heading and moves no other project's task", async () => {
		const { svc, store } = setup(SOON, []);
		const screen = await svc.screen(T, "P");
		const b = screen.soon[1].key;
		expect(await svc.createSection("New", { kind: "list", list: "soon", group: null, before: b, project: "P" })).toBeNull();
		expect(store.text).toBe(SOON);
		await svc.createInPlace("First", null, { kind: "list", list: "soon", group: null, before: null, project: "P", section: "New" });
		expect(store.text).toContain("## Soon\n\n- [ ] A 🗂️ [[P]]\n- [ ] X\n- [ ] B 🗂️ [[P]]\n- [ ] Y\n### New\n- [ ] First 🗂️ [[P]]\n\n## Done\n");
	});

	it("a drop after the view's last task lands right after it, not at the section's end", async () => {
		const { svc, store } = setup(SOON, []);
		const screen = await svc.screen(T, "P");
		const [a] = screen.soon;
		await svc.drop([{ key: a.key, from: "soon" }], { kind: "place", column: "soon", place: { kind: "task", group: null, before: null, project: "P" } }, T);
		expect(store.text).toContain("## Soon\n\n- [ ] X\n- [ ] B 🗂️ [[P]]\n- [ ] A 🗂️ [[P]]\n- [ ] Y\n");
	});

	it("search from the view finds only the project's tasks (decision 26)", async () => {
		const { svc } = setup();
		expect((await svc.search("B", "Окружение")).flatMap((g) => g.hits.map((h) => h.item.text))).toEqual(["B1", "B3", "B1a"]);
		expect((await svc.search("B")).flatMap((g) => g.hits.map((h) => h.item.text))).toEqual(expect.arrayContaining(["B2", "B4"]));
	});
});

describe("a grouped list's group, ready to draw", () => {
	it("an empty group has its empty part; an open group's header means its part without a section, a folded one its end", async () => {
		const { svc } = setup();
		await svc.toggleFold("backlog", "окружение");
		const groups = (await svc.screen(T)).projects.backlog.groups;
		expect(groups[0].sections).toEqual([{ name: null, items: [], rows: [], empty: true, menu: null, header: false, reorder: false }]);
		expect(groups[0]).toMatchObject({ titled: true, head: { group: null, project: "Английский" } });
		expect(groups[1].head).toEqual({ group: "Дальний", project: "Окружение" });
	});

	it("the Project row's value is ready: the shared name, «No project», or nothing when they differ", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const at = { today: T, day: T, offer: screen.offer };
		expect(svc.menu(screen.backlog[0], "backlog", at).project.value).toBe("Окружение");
		expect(svc.menu(screen.backlog[1], "backlog", at).project.value).toBe("No project");
		expect(svc.bulkMenu([{ item: screen.backlog[0], from: "backlog" }, { item: screen.backlog[1], from: "backlog" }], at).project.value).toBe("");
	});
});

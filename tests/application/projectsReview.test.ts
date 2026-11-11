import { describe, expect, it } from "vitest";
import { PROJECTS_HOVER_MS, PROJECTS_INDENT, type ProjectsView } from "../../core/application/contracts";
import { memoryProjectsScreen, type Clock, type Projects } from "../../core/application/ports";
import { projectsDrop } from "../../core/application/projectsScreen";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { cleanProjectName } from "../../core/domain/Project";
import { readTree } from "../../core/domain/ProjectTree";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-11";
const clock: Clock = { now: () => new Date(2026, 10, 11, 12, 0) };

const FILE = [
	"## Inbox",
	"",
	"- [ ] Встреча 🗂️ Дружба 🗂️ Small talk",
	"- [ ] Другое",
	"",
	"## Projects",
	"",
	"- Дружба",
	"\t- Small talk",
	"- Спорт",
	"",
	"## Now",
	"",
	"## Soon",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
	"- [x] Старое 🗂️ Спорт",
	"",
].join("\n");

function setup(text = FILE, projects?: Projects) {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, memoryProjectsScreen());
	return { store, svc };
}

const cards = (view: ProjectsView) => view.sections.flatMap((s) => s.cards);

describe("a task drawn twice", () => {
	it("has a card of its own in each part, each with its own id and what a drop of it names", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Дружба");
		const twice = cards(await svc.projectsScreen()).filter((c) => c.item.title === "Встреча");
		expect(twice.map((c) => c.from)).toEqual(["Дружба", "Small talk"]);
		expect(new Set(twice.map((c) => c.id)).size).toBe(2);
		expect(twice.map((c) => c.drop.from)).toEqual(["Дружба", "Small talk"]);
	});

	it("dropped from the Small talk part, it loses Small talk, not Дружба", async () => {
		const { svc, store } = setup();
		await svc.selectProjectNode("project:Дружба");
		const card = cards(await svc.projectsScreen()).find((c) => c.item.title === "Встреча" && c.from === "Small talk")!;
		await svc.dropOnProject([card.drop], "project:Спорт");
		expect(store.text).toContain("- [ ] Встреча 🗂️ Дружба 🗂️ Спорт\n");
	});

	it("a closed task's card can't be dropped; an open one can", async () => {
		const { svc } = setup();
		await svc.tapProjectNode("done");
		const done = cards(await svc.projectsScreen());
		expect(done.map((c) => [c.item.title, c.canDrop])).toEqual([["Старое", false]]);
		await svc.tapProjectNode("all");
		expect(cards(await svc.projectsScreen()).every((c) => c.canDrop)).toBe(true);
	});
});

describe("the move waits for the host's notes", () => {
	const OLD = ["## Inbox", "", "- [ ] Позвонить 🗂️ [[Дружба]]", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

	it("runs only once the notes are complete, and then attaches them", async () => {
		let ready = false;
		const port: Projects = { list: () => (ready ? [{ name: "Дружба", path: "Дружба.md", link: "Дружба" }] : []), ready: () => ready, onChange: () => () => undefined };
		const { svc, store } = setup(OLD, port);
		await svc.screen(T);
		expect(store.text).toBe(OLD);
		ready = true;
		await svc.screen(T);
		expect(store.text).toContain("- [ ] Позвонить 🗂️ Дружба\n\n## Projects\n\n- Дружба [[Дружба]]\n");
	});
});

describe("two ## Projects sections, as Sync may merge them", () => {
	const TWO = ["## Inbox", "", "## Projects", "", "- Дружба [[Дружба]]", "\t- Small talk", "", "## Now", "", "## Projects", "", "- дружба", "\t- Старые друзья", "- Спорт", "", "## Soon", ""].join("\n");

	it("read as one tree, the first name winning", () => {
		const tree = readTree(TWO.split("\n"));
		expect(tree.all().map((p) => p.path.join("/"))).toEqual(["Дружба", "Дружба/Small talk", "Дружба/Старые друзья", "Спорт"]);
	});

	it("written back as one, under the first heading", async () => {
		const { svc, store } = setup(TWO);
		await svc.createProject("Новый", { parent: null, before: null });
		expect(store.text).toBe(["## Inbox", "", "## Projects", "", "- Дружба [[Дружба]]", "\t- Small talk", "\t- Старые друзья", "- Спорт", "- Новый", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n"));
	});
});

describe("a renamed project and an old field written later", () => {
	it("brings back no note the tree has, and attaches only the notes the old fields name", async () => {
		const text = ["## Inbox", "", "- [ ] A 🗂️ Friends", "- [ ] B 🗂️ [[Спорт]]", "", "## Projects", "", "- Friends [[Дружба]]", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
		const notes = [
			{ name: "Дружба", path: "Дружба.md", link: "Дружба" },
			{ name: "Спорт", path: "Спорт.md", link: "Спорт" },
			{ name: "Музыка", path: "Музыка.md", link: "Музыка" },
		];
		const { svc, store } = setup(text, { list: () => notes, onChange: () => () => undefined });
		await svc.screen(T);
		expect(store.text).toContain("- [ ] B 🗂️ Спорт\n\n## Projects\n\n- Friends [[Дружба]]\n- Спорт [[Спорт]]\n\n## Now");
	});
});

describe("the parity rules", () => {
	it("give the hover delay and the indent of a step", () => {
		expect(PROJECTS_HOVER_MS).toBe(600);
		expect(PROJECTS_INDENT).toBe(12);
	});

	it("a lifted project keeps its depth until the finger shifts a step; the plus starts at the row above's", async () => {
		const view = await setup().svc.projectsScreen();
		const rows = view.rows;
		const gap = rows.findIndex((r) => r.kind === "none");
		expect(projectsDrop(rows, gap, 0, "project:Small talk")).toEqual({ place: { parent: "Дружба", before: null }, depth: 1 });
		expect(projectsDrop(rows, gap, -5, "project:Small talk")).toMatchObject({ depth: 1 });
		expect(projectsDrop(rows, gap, -7, "project:Small talk")).toEqual({ place: { parent: null, before: null }, depth: 0 });
		expect(projectsDrop(rows, gap, 0)).toEqual({ place: { parent: "Дружба", before: null }, depth: 1 });
	});
});

describe("names", () => {
	it("a typed name loses the field marks standing as words", () => {
		expect(cleanProjectName("Спорт 📅 🔁 зал 📁")).toBe("Спорт зал");
		expect(cleanProjectName(" 📌 ")).toBeNull();
	});

	it("a rename keeps the choice by the cleaned name", async () => {
		const { svc } = setup();
		await svc.selectProjectNode("project:Спорт");
		expect(await svc.renameProject("Спорт", "  Бег  ")).toBe(true);
		expect((await svc.projectsScreen()).selected).toBe("project:Бег");
	});

	it("search finds a task by any of its projects", async () => {
		const { svc } = setup();
		expect((await svc.search("Small")).flatMap((g) => g.hits).map((h) => h.item.title)).toEqual(["Встреча"]);
	});

	it("a blank project name is told by a rule, and makes nothing", async () => {
		const { svc } = setup();
		expect(svc.isBlankProjectName(" 📅 ")).toBe(true);
		expect(svc.isBlankProjectName("Бег")).toBe(false);
		expect(await svc.createProject("  ", { parent: null, before: null })).toBeNull();
	});
});

describe("re-review", () => {
	it("a project made before the host's notes are complete stops no note from becoming a project at the move", async () => {
		const OLD = ["## Inbox", "", "- [ ] Позвонить 🗂️ [[Дружба]]", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
		let ready = false;
		const notes = [
			{ name: "Дружба", path: "Дружба.md", link: "Дружба" },
			{ name: "Музыка", path: "Музыка.md", link: "Музыка" },
		];
		const port: Projects = { list: () => (ready ? notes : []), ready: () => ready, onChange: () => () => undefined };
		const { svc, store } = setup(OLD, port);
		await svc.createProject("Новый", { parent: null, before: null });
		expect(store.text).toContain("- Новый");
		ready = true;
		await svc.screen(T);
		expect(store.text).toContain("- [ ] Позвонить 🗂️ Дружба\n");
		expect(store.text).toContain("- Дружба [[Дружба]]\n");
		expect(store.text).toContain("- Музыка [[Музыка]]\n");
	});

	it("a typed name loses the settings' own field marks standing as words", async () => {
		const settings = new FakeSettingsStore();
		await settings.update({ dueDateMarker: "🗓" });
		const svc = new TaskServiceImpl(new InMemoryTaskFileStore(FILE), settings, clock, null, undefined, memoryProjectsScreen());
		expect(svc.isBlankProjectName(" 🗓 ")).toBe(true);
		expect(await svc.createProject("Бег 🗓 утро", { parent: null, before: null })).toMatchObject({ name: "Бег утро" });
	});
});

import { describe, expect, it } from "vitest";
import type { Clock, NoteFiles } from "../../core/application/ports";
import { memoryGrouping } from "../../core/application/ports";
import { newProjectNote } from "../../core/application/projects";
import { withProjectTag } from "../../core/domain/NoteTags";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import type { ProjectNote } from "../../core/application/contracts";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-10";
const clock: Clock = { now: () => new Date(2026, 10, 10, 14, 20) };
const NOTES: readonly ProjectNote[] = [
	{ name: "Дружба", path: "Дружба.md", link: "Дружба" },
	{ name: "Английский", path: "Учёба/Английский.md", link: "Английский" },
];
const FILE = ["## Now", "## Soon", "- [ ] S 🗂️ [[Дружба]]", "\t- [ ] Sub", "- [ ] Plain", "## Backlog", "- [ ] B", "## Done", ""].join("\n");

/** A vault of notes in memory, as the plugin's infrastructure gives the core its files. */
class MemoryNotes implements NoteFiles {
	constructor(readonly files: Map<string, string>) {}
	paths(): readonly string[] {
		return [...this.files.keys()];
	}
	async read(path: string): Promise<string> {
		return this.files.get(path) ?? "";
	}
	async write(path: string, text: string): Promise<void> {
		this.files.set(path, text);
	}
}

function setup(text = FILE, files = new Map<string, string>()) {
	const store = new InMemoryTaskFileStore(text);
	const notes = new MemoryNotes(files);
	const projects = { list: () => NOTES, onChange: () => () => undefined };
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, memoryGrouping(), undefined, notes);
	return { store, notes, svc };
}

describe("grouped Soon shows every project (point 5)", () => {
	it("a project with no task in Soon has its empty group, as in Backlog; No project still only with something in it", async () => {
		const { svc } = setup(["## Now", "## Soon", "- [ ] S 🗂️ [[Дружба]]", "## Backlog", "## Done", ""].join("\n"));
		await svc.setGrouping("soon", true);
		const { projects } = await svc.screen(T);
		expect(projects.soon.groups.map((g) => [g.title, g.count, g.sections[0].empty])).toEqual([
			["Английский", 0, true],
			["Дружба", 1, false],
		]);
	});
});

describe("New project… on every Project page (point 6)", () => {
	it("the page names it", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const at = { today: T, day: T, offer: screen.offer };
		expect(svc.menu(screen.soon[0], "soon", at).project.newLabel).toBe("New project…");
		expect(svc.bulkMenu([{ item: screen.soon[0], from: "soon" }], at).project.newLabel).toBe("New project…");
	});

	it("a new name: a note at the vault's root, linked by its name", () => {
		expect(newProjectNote("  Свой дом ", [{ path: "Дружба.md" }])).toEqual({ name: "Свой дом", path: "Свой дом.md", link: "Свой дом", exists: false });
	});

	it("a name a note has: that note, case aside, linked as Obsidian links it", () => {
		expect(newProjectNote("дружба", [{ path: "Люди/Дружба.md" }])).toEqual({ name: "Дружба", path: "Люди/Дружба.md", link: "Дружба", exists: true });
		expect(newProjectNote("Дружба", [{ path: "Люди/Дружба.md" }, { path: "Дружба.md" }])).toMatchObject({ path: "Дружба.md", link: "Дружба", exists: true });
	});

	it("empty, or nothing a file name may hold: nothing", () => {
		expect(newProjectNote("   ", [])).toBeNull();
		expect(newProjectNote("/:?", [])).toBeNull();
		expect(newProjectNote("A/B: c?", [])).toMatchObject({ name: "AB c", path: "AB c.md" });
	});

	it("a new note's text: the tag in its properties' tags, without #", () => {
		expect(withProjectTag(null, "#project")).toBe("---\ntags:\n  - project\n---\n");
	});

	it("an existing note gets the tag in its properties, the rest untouched", () => {
		expect(withProjectTag("Text #idea\n", "#project")).toBe("---\ntags:\n  - project\n---\nText #idea\n");
		expect(withProjectTag("---\naliases: [a]\n---\nBody\n", "#project")).toBe("---\naliases: [a]\ntags:\n  - project\n---\nBody\n");
		expect(withProjectTag("---\ntags:\n  - people\nlater: 1\n---\nBody\n", "#project")).toBe("---\ntags:\n  - people\n  - project\nlater: 1\n---\nBody\n");
		expect(withProjectTag("---\ntags: [people, life]\n---\n", "#project")).toBe("---\ntags: [people, life, project]\n---\n");
		expect(withProjectTag("---\ntags: people\n---\n", "#project")).toBe("---\ntags:\n  - people\n  - project\n---\n");
		expect(withProjectTag("---\ntags:\n---\n", "#project")).toBe("---\ntags:\n  - project\n---\n");
	});

	it("a note that has the tag already is left as it is", () => {
		const tagged = "---\ntags:\n  - Project\n---\nBody\n";
		expect(withProjectTag(tagged, "#project")).toBe(tagged);
		expect(withProjectTag("Body #project\n", "#project")).toBe("Body #project\n");
	});

	it("the service writes the note and gives the tasks the project in one call", async () => {
		const { svc, store, notes } = setup();
		const screen = await svc.screen(T);
		const plain = screen.soon.find((i) => i.text === "Plain")!;
		const made = await svc.newProject("Свой дом", [plain.key]);
		expect(made).toEqual({ name: "Свой дом", link: "Свой дом", note: "Свой дом.md", canOpenNote: true, mark: true });
		expect(notes.files.get("Свой дом.md")).toBe("---\ntags:\n  - project\n---\n");
		expect(store.text).toContain("- [ ] Plain 🗂️ [[Свой дом]]\n");
	});

	it("an existing note of that name is tagged, not made again; no task: only the note", async () => {
		const { svc, store, notes } = setup(FILE, new Map([["Люди/Семья.md", "# Семья\n"]]));
		const before = store.text;
		expect(await svc.newProject("семья", [])).toMatchObject({ name: "Семья", link: "Семья", note: "Люди/Семья.md" });
		expect(notes.files.get("Люди/Семья.md")).toBe("---\ntags:\n  - project\n---\n# Семья\n");
		expect([...notes.files.keys()]).toEqual(["Люди/Семья.md"]);
		expect(store.text).toBe(before);
	});

	it("a name of a file the plugin owns (the tasks file, a calendar file) makes nothing: the file is never tagged", async () => {
		const owned = ["TODOs Tasks.md", "calendar/work.json", "Дела/Work.md"];
		expect(newProjectNote("todos tasks", [{ path: "TODOs Tasks.md" }, { path: "Дружба.md" }], owned)).toBeNull();
		expect(newProjectNote("Work", [{ path: "Дела/Work.md" }], owned)).toBeNull();
		expect(newProjectNote("Дружба", [{ path: "TODOs Tasks.md" }, { path: "Дружба.md" }], owned)).toMatchObject({ path: "Дружба.md", exists: true });
		const { svc, notes } = setup(FILE, new Map([["TODOs Tasks.md", "## Inbox\n"]]));
		expect(await svc.newProject("TODOs Tasks", [])).toBeNull();
		expect(notes.files.get("TODOs Tasks.md")).toBe("## Inbox\n");
	});

	it("an empty name writes nothing", async () => {
		const { svc, notes } = setup();
		expect(await svc.newProject("  ", [])).toBeNull();
		expect(notes.files.size).toBe(0);
	});
});

describe("the full screen's project line (point 7)", () => {
	it("the task's project, a subtask's its parent's; none without one", async () => {
		const { svc } = setup();
		const screen = await svc.screen(T);
		const s = screen.soon.find((i) => i.text === "S")!;
		expect(svc.fullTree(s).project).toEqual({ name: "Дружба", link: "Дружба", note: "Дружба.md", canOpenNote: true, mark: true });
		expect(svc.fullTree(s.allSubtasks[0]).project?.name).toBe("Дружба");
		expect(svc.fullTree(screen.soon.find((i) => i.text === "Plain")!).project).toBeNull();
	});
});

describe("a task written with a project of its own", () => {
	it("goes where its place says, with the project given; a subtask ignores it", async () => {
		const { svc, store } = setup();
		await svc.createInPlace("Last", null, { kind: "list", list: "soon", group: null, before: null }, null, [], "Английский");
		expect(store.text).toContain("- [ ] Plain\n- [ ] Last 🗂️ [[Английский]]\n");
		const screen = await svc.screen(T);
		const s = screen.soon.find((i) => i.text === "S")!;
		await svc.createInPlace("Under", null, { kind: "subtask", parent: s.key, before: null }, null, [], "Английский");
		expect(store.text).toContain("\t- [ ] Sub\n\t- [ ] Under\n");
	});

	it("a slot takes it too, over the place's own", async () => {
		const { svc, store } = setup();
		await svc.createInPlace("At ten", null, { kind: "slot", slot: { date: T, start: 600, end: null } }, null, [], "Дружба");
		expect(store.text).toMatch(/- \[ \] At ten 🗂️ \[\[Дружба\]\] 📌 2026-11-10 10:00/);
	});
});

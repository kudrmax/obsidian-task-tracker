import { describe, expect, it } from "vitest";
import { StaleTaskError, type ListPlace, type ProjectsSection, type ProjectsView } from "../../core/application/contracts";
import { callDoor, type DoorAnswer } from "../../core/application/PhoneCalls";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const clock: Clock = { now: () => new Date(2026, 10, 11, 12, 0) };

const FILE = [
	"## Inbox",
	"",
	"- [ ] Inbox A 🗂️ P",
	"- [ ] Inbox loose",
	"",
	"## Projects",
	"",
	"- P",
	"\t- Sub",
	"\t- Empty",
	"- Q",
	"",
	"## Now",
	"",
	"- [ ] Now A 🗂️ P",
	"",
	"## Soon",
	"",
	"- [ ] Soon A 🗂️ P",
	"- [ ] Soon other",
	"- [ ] Soon B 🗂️ Sub 🗂️ Q",
	"",
	"### Evening",
	"",
	"- [ ] Soon E 🗂️ P",
	"",
	"## Backlog",
	"",
	"- [ ] Back A 🗂️ P 📁",
	"\t- [ ] Step 1",
	"\t- [ ] Step 2",
	"- [ ] Back B 🗂️ P",
	"\t- [ ] Child",
	"- [ ] Back Q 🗂️ Q",
	"",
	"## Done",
	"",
	"- [x] Closed 🗂️ P",
	"",
].join("\n");

async function setup(node = "project:P", mode: "byProject" | "byStage" = "byProject", text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, memoryProjectsScreen());
	await svc.selectProjectNode(node);
	await svc.setProjectsMode(mode);
	return { store, svc };
}

const titled = (view: ProjectsView, title: string | null): ProjectsSection => view.sections.find((s) => s.title === title)!;
const cardIn = (section: ProjectsSection, title: string) => section.cards.find((c) => c.item.title === title)!;
const rowIn = (section: ProjectsSection, title: string) => section.rows.find((r) => r.item.title === title)!;
const lines = (text: string, heading: string) => text.split(`## ${heading}\n\n`)[1].split("\n## ")[0];

describe("the order of the Projects screen", () => {
	it("By stage: Inbox, Backlog, Soon, Today, each shown even with no task, so a card can be dropped there", async () => {
		const { svc } = await setup("project:Q", "byStage");
		const view = await svc.projectsScreen();
		expect(view.sections.map((s) => [s.title, s.empty, s.plate, s.cards.map((c) => c.item.title)])).toEqual([
			["Inbox", true, true, []],
			["Backlog", false, false, ["Back Q"]],
			["Soon", false, false, ["Soon B"]],
			["Today", true, true, []],
		]);
	});

	it("Done shows last, only under Done, and the list there takes no drop", async () => {
		const { svc } = await setup("done", "byStage", FILE.replace("- [ ] Back Q 🗂️ Q", "").replace("- [ ] Soon B 🗂️ Sub 🗂️ Q", "- [ ] Soon B 🗂️ Sub").replace("- [x] Closed 🗂️ P", "- [x] Closed 🗂️ Q"));
		const view = await svc.projectsScreen();
		expect(view.sections.map((s) => [s.title, s.cards.map((c) => c.item.title)])).toEqual([["Done", ["Closed"]]]);
		expect(view.reorders).toBe(false);
		expect((await (await setup()).svc.projectsScreen()).reorders).toBe(true);
	});

	it("By project: each part in stage order, Inbox, Backlog, Soon, Today, then the file's order; an empty subproject shows", async () => {
		const { svc } = await setup();
		const view = await svc.projectsScreen();
		expect(view.sections.map((s) => [s.title, s.group, s.header, s.empty, s.plate, s.cards.map((c) => c.item.title)])).toEqual([
			[null, null, false, false, false, ["Inbox A", "Back A", "Back B", "Soon A", "Soon E", "Now A"]],
			["Sub", "project:Sub", true, false, false, ["Soon B"]],
			["Empty", "project:Empty", true, true, true, []],
		]);
	});

	it("a project with no own task keeps its own part, empty and without a plate, above its subprojects", async () => {
		const { svc } = await setup("project:P", "byProject", FILE.replace("- [ ] Inbox A 🗂️ P", "- [ ] Inbox A").replace(/ 🗂️ P/gu, ""));
		const own = (await svc.projectsScreen()).sections[0];
		expect([own.title, own.group, own.empty, own.plate]).toEqual([null, null, true, false]);
	});
});

describe("subtasks in the Projects list, as in the funnel's lists", () => {
	it("an unfolded task gives its subtask stack, a folded one its next step; each row says what its drop takes", async () => {
		const { svc } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		expect(own.rows.map((r) => [r.item.title, r.level, r.card !== null])).toEqual([
			["Inbox A", 0, true],
			["Back A", 0, true],
			["Back B", 0, true],
			["Child", 1, false],
			["Soon A", 0, true],
			["Soon E", 0, true],
			["Now A", 0, true],
		]);
		expect(rowIn(own, "Back A").item.card).toMatchObject({ title: "Step 1", over: "Back A" });
		expect(rowIn(own, "Child").drop).toEqual({ key: rowIn(own, "Child").item.key, from: "P" });
		expect(new Set(own.rows.map((r) => r.id)).size).toBe(own.rows.length);
	});

	it("the fold is the lists' own write", async () => {
		const { svc, store } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		await svc.toggleCollapsed(rowIn(own, "Back A").item.key);
		expect(rowIn((await svc.projectsScreen()).sections[0], "Step 1").level).toBe(1);
		expect(store.text).toContain("- [ ] Back A 🗂️ P\n");
	});

	it("a card let go under a task nests there, as in the lists", async () => {
		const { svc, store } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		const place: ListPlace = { kind: "subtask", parent: rowIn(own, "Back B").item.key, before: null };
		await svc.dropInProjects([cardIn(own, "Inbox A").drop], place);
		expect(lines(store.text!, "Backlog")).toContain("- [ ] Back B 🗂️ P\n\t- [ ] Child\n\t- [ ] Inbox A");
		expect(lines(store.text!, "Inbox")).not.toContain("Inbox A");
	});

	it("a subtask let go between tasks of another subproject's part becomes a task there, of that project", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		await svc.dropInProjects([rowIn(view.sections[0], "Child").drop], { kind: "task", group: "project:Sub", before: null });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon B 🗂️ Sub 🗂️ Q\n- [ ] Child 🗂️ Sub\n");
		expect(lines(store.text!, "Backlog")).toContain("- [ ] Back B 🗂️ P\n- [ ] Back Q");
	});
});

describe("By stage: a drop moves the task to that stage's list at that place", () => {
	it("in another stage, right after the card above, its projects kept", async () => {
		const { svc, store } = await setup("project:P", "byStage");
		const view = await svc.projectsScreen();
		await svc.dropInProjects([cardIn(titled(view, "Inbox"), "Inbox A").drop], { kind: "task", group: "soon", before: cardIn(titled(view, "Soon"), "Soon E").item.key });
		expect(lines(store.text!, "Soon")).toBe("- [ ] Soon A 🗂️ P\n- [ ] Soon other\n- [ ] Soon B 🗂️ Sub 🗂️ Q\n- [ ] Inbox A 🗂️ P\n\n### Evening\n\n- [ ] Soon E 🗂️ P\n");
	});

	it("into Today as a drop on the day list writes it: into Now, dated today", async () => {
		const { svc, store } = await setup("project:Q", "byStage");
		const view = await svc.projectsScreen();
		await svc.dropInProjects([cardIn(titled(view, "Backlog"), "Back Q").drop], { kind: "task", group: "today", before: null });
		expect(lines(store.text!, "Now")).toBe("- [ ] Now A 🗂️ P\n- [ ] Back Q 🗂️ Q 📅 2026-11-11\n");
	});

	it("inside its own stage only reorders: at the top, before the card below", async () => {
		const { svc, store } = await setup("project:P", "byStage");
		const backlog = titled(await svc.projectsScreen(), "Backlog");
		await svc.dropInProjects([cardIn(backlog, "Back B").drop], { kind: "task", group: "backlog", before: cardIn(backlog, "Back A").item.key });
		expect(lines(store.text!, "Backlog")).toBe("- [ ] Back B 🗂️ P\n\t- [ ] Child\n- [ ] Back A 🗂️ P 📁\n\t- [ ] Step 1\n\t- [ ] Step 2\n- [ ] Back Q 🗂️ Q\n");
	});

	it("several cards go together, in the file's order", async () => {
		const { svc, store } = await setup("project:P", "byStage");
		const view = await svc.projectsScreen();
		const cards = [cardIn(titled(view, "Today"), "Now A").drop, cardIn(titled(view, "Inbox"), "Inbox A").drop];
		await svc.dropInProjects(cards, { kind: "task", group: "backlog", before: null });
		expect(lines(store.text!, "Backlog")).toContain("- [ ] Back B 🗂️ P\n\t- [ ] Child\n- [ ] Inbox A 🗂️ P\n- [ ] Now A 🗂️ P\n- [ ] Back Q 🗂️ Q\n");
	});
});

describe("By project: a drop takes the stage of the card above, and the part's project", () => {
	it("between cards of another stage, right after the card above in the file", async () => {
		const { svc, store } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		await svc.dropInProjects([cardIn(own, "Now A").drop], { kind: "task", group: null, before: cardIn(own, "Soon A").item.key });
		expect(lines(store.text!, "Backlog")).toContain("- [ ] Back B 🗂️ P\n\t- [ ] Child\n- [ ] Now A 🗂️ P\n- [ ] Back Q 🗂️ Q\n");
		expect(store.text).toContain("## Now\n\n## Soon");
	});

	it("at a part's top, the card below's stage, right before it; another subproject's part swaps the project it was shown under", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		const sub = titled(view, "Sub");
		await svc.dropInProjects([cardIn(view.sections[0], "Now A").drop], { kind: "task", group: "project:Sub", before: cardIn(sub, "Soon B").item.key });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon other\n- [ ] Now A 🗂️ Sub\n- [ ] Soon B 🗂️ Sub 🗂️ Q\n");
	});

	it("a card shown under a subproject dropped in the node's own part takes the node, its other projects stay", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		const own = view.sections[0];
		await svc.dropInProjects([cardIn(titled(view, "Sub"), "Soon B").drop], { kind: "task", group: null, before: cardIn(own, "Soon E").item.key });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon B 🗂️ Q 🗂️ P\n");
	});

	it("into an empty part, as that part's plus writes: at the end of Inbox, with that project", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		await svc.dropInProjects([cardIn(view.sections[0], "Back A").drop], { kind: "task", group: "project:Empty", before: null });
		expect(lines(store.text!, "Inbox")).toBe("- [ ] Inbox A 🗂️ P\n- [ ] Inbox loose\n- [ ] Back A 🗂️ Empty 📁\n\t- [ ] Step 1\n\t- [ ] Step 2\n");
	});

	it("All: a drop at another project's part's end takes the stage of its last card and swaps the project", async () => {
		const { svc, store } = await setup("all");
		const view = await svc.projectsScreen();
		await svc.dropInProjects([cardIn(titled(view, "P"), "Inbox A").drop], { kind: "task", group: "project:Q", before: null });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon B 🗂️ Sub 🗂️ Q\n- [ ] Inbox A 🗂️ Q\n");
	});

	it("a part the screen no longer has is stale: nothing is written", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		const before = store.text;
		await expect(svc.dropInProjects([view.sections[0].cards[0].drop], { kind: "task", group: "project:Gone", before: null })).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(before);
	});
});

describe("a drop before it is written", () => {
	it("gives the Projects screen it leaves, and where each card lands on it", async () => {
		const { svc } = await setup();
		const view = await svc.projectsScreen();
		const card = cardIn(view.sections[0], "Now A");
		const place: ListPlace = { kind: "task", group: "project:Sub", before: null };
		const preview = await svc.projectsDropPreview([card.drop], place);
		expect(preview.landings).toEqual([{ kind: "card", id: card.item.id, item: expect.objectContaining({ title: "Now A" }), card: `project:Sub/${card.item.id}`, section: "project:Sub", index: 1 }]);
		await svc.dropInProjects([card.drop], place);
		expect(await svc.projectsScreen()).toEqual(preview.view);
	});

	it("a card nested lands as a subtask of its new parent", async () => {
		const { svc } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		const parent = rowIn(own, "Back B").item;
		const preview = await svc.projectsDropPreview([cardIn(own, "Inbox A").drop], { kind: "subtask", parent: parent.key, before: null });
		expect(preview.landings[0]).toMatchObject({ kind: "subtask", parent: parent.id, index: 1 });
	});
});

describe("the door", () => {
	type Ok = Extract<DoorAnswer, { ok: true }>;
	const nowMs = new Date(2026, 10, 11, 12, 0).getTime();
	const call = (method: string, args: unknown[], tasks: string) => callDoor(method, args, { tasks, nowMs, projectsScreen: { selected: "project:P" } }) as Ok;

	it("drops in the Projects list and previews it, a step of undo", () => {
		const view = call("tasks.projectsScreen", [], FILE).result as ProjectsView;
		const card = cardIn(view.sections[0], "Now A");
		const place: ListPlace = { kind: "task", group: "project:Sub", before: null };
		const preview = call("tasks.projectsDropPreview", [[card.drop], place], FILE).result as { landings: { kind: string }[] };
		expect(preview.landings[0].kind).toBe("card");
		const dropped = call("tasks.dropInProjects", [[card.drop], place], FILE);
		expect(dropped.step).toBe(true);
		expect(dropped.tasks).toContain("- [ ] Now A 🗂️ Sub\n");
	});

	it("deletes a project, its tasks kept", () => {
		const deleted = call("tasks.deleteProject", ["P"], FILE);
		expect(deleted.step).toBe(true);
		expect(deleted.tasks).toContain("## Projects\n\n- Sub\n- Empty\n- Q\n");
		expect(deleted.tasks).toContain("- [ ] Inbox A\n");
		expect(deleted.tasks).toContain("- [x] Closed\n");
	});
});

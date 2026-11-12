import { describe, expect, it } from "vitest";
import { placeAt, projectsTakes, StaleTaskError, type ListPlace, type PlacedCard, type PlacedHead, type ProjectsSection, type ProjectsView } from "../../core/application/contracts";
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

async function setup(node = "project:P", _mode: "byProject" | "byStage" = "byProject", text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, memoryProjectsScreen());
	await svc.selectProjectNode(node);
	return { store, svc };
}

const titled = (view: ProjectsView, title: string | null): ProjectsSection => view.sections.find((s) => s.title === title)!;
const cardIn = (section: ProjectsSection, title: string) => section.cards.find((c) => c.item.title === title)!;
const rowIn = (section: ProjectsSection, title: string) => section.rows.find((r) => r.item.title === title)!;
const lines = (text: string, heading: string) => text.split(`## ${heading}\n\n`)[1].split("\n## ")[0];

describe("the order of the Projects screen", () => {
	it("Done shows last, only under Done, and the list there takes no drop", async () => {
		const { svc } = await setup("done", "byProject", FILE.replace("- [ ] Back Q 🗂️ Q", "").replace("- [ ] Soon B 🗂️ Sub 🗂️ Q", "- [ ] Soon B 🗂️ Sub").replace("- [x] Closed 🗂️ P", "- [x] Closed 🗂️ Q"));
		const view = await svc.projectsScreen();
		expect(view.sections.map((s) => [s.title, s.cards.map((c) => c.item.title)])).toEqual([["Q", ["Closed"]]]);
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

/** The list laid out as a frontend draws it, each part's head passed through as the core gives it: headers 30 high, rows 40. */
function laidOut(view: ProjectsView): { cards: PlacedCard[]; heads: PlacedHead[] } {
	const cards: PlacedCard[] = [];
	const heads: PlacedHead[] = [];
	let y = 0;
	for (const section of view.sections) {
		if (section.header) {
			heads.push({ group: section.group, opens: section.opens, firstCard: cards.length, top: y, height: 30 });
			y += 30;
		}
		for (const row of section.rows) {
			cards.push({ level: row.level, group: section.group, top: y, height: 40 });
			y += 40;
		}
	}
	return { cards, heads };
}

describe("the parts as the lists' drop machinery takes them", () => {
	it("a header opens its part only with no untitled part above it", async () => {
		const byProject = await (await setup()).svc.projectsScreen();
		expect(byProject.sections.map((s) => [s.title, s.opens])).toEqual([
			[null, false],
			["Sub", false],
			["Empty", false],
		]);
	});

	it("the gap under the own part's last card is the own part's; past the first header, the subproject's", async () => {
		const view = await (await setup()).svc.projectsScreen();
		const { cards, heads } = laidOut(view);
		const own = view.sections[0].rows.length;
		const bottom = own * 40;
		expect(placeAt(cards, bottom - 5, 0, 0, null, heads)).toMatchObject({ index: own, group: null });
		expect(placeAt(cards, bottom + 5, 0, 0, null, heads)).toMatchObject({ index: own, group: null });
		expect(placeAt(cards, bottom + 31, 0, 0, null, heads)).toMatchObject({ index: own, group: "project:Sub" });
	});

	it("an empty own part above subprojects is the place above the first header", async () => {
		const view = await (await setup("project:P", "byProject", FILE.replace(/ 🗂️ P/gu, ""))).svc.projectsScreen();
		expect(view.sections[0]).toMatchObject({ group: null, empty: true, plate: false });
		const { cards, heads } = laidOut(view);
		expect(placeAt(cards, 10, 0, 0, null, heads)).toMatchObject({ index: 0, group: null });
		expect(placeAt(cards, 35, 0, 0, null, heads)).toMatchObject({ index: 0, group: "project:Sub" });
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
		expect(rowIn(own, "Child").drop).toEqual({ key: rowIn(own, "Child").item.key, from: "P", lifted: { id: rowIn(own, "Child").item.id, list: "backlog", origin: "backlog" } });
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

describe("By project: a drop takes the stage of the card above, and the part's project", () => {
	it("between cards of another stage, right after the card above in the file", async () => {
		const { svc, store } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		await svc.dropInProjects([cardIn(own, "Inbox A").drop], { kind: "task", group: null, before: cardIn(own, "Soon A").item.key });
		expect(lines(store.text!, "Backlog")).toContain("- [ ] Back B 🗂️ P\n\t- [ ] Child\n- [ ] Inbox A 🗂️ P\n- [ ] Back Q 🗂️ Q\n");
	});

	it("where the card above's stage refuses it, the card below's stage takes it", async () => {
		const { svc, store } = await setup();
		const own = (await svc.projectsScreen()).sections[0];
		await svc.dropInProjects([cardIn(own, "Now A").drop], { kind: "task", group: null, before: cardIn(own, "Soon A").item.key });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Now A 🗂️ P\n- [ ] Soon A 🗂️ P\n");
		expect(store.text).toContain("## Now\n\n## Soon");
	});

	it("at a part's top, the card below's stage, right before it; another subproject's part swaps the project it was shown under", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		const sub = titled(view, "Sub");
		await svc.dropInProjects([cardIn(view.sections[0], "Now A").drop], { kind: "task", group: "project:Sub", before: cardIn(sub, "Soon B").item.key });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon other\n- [ ] Now A 🗂️ Sub\n- [ ] Soon B 🗂️ Sub 🗂️ Q\n");
	});

	it("a card shown under a subproject dropped in the node's own part takes the node in that project's place, its other projects stay", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		const own = view.sections[0];
		await svc.dropInProjects([cardIn(titled(view, "Sub"), "Soon B").drop], { kind: "task", group: null, before: cardIn(own, "Soon E").item.key });
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon A 🗂️ P\n- [ ] Soon B 🗂️ P 🗂️ Q\n- [ ] Soon other\n");
	});

	it("into an empty part only the project changes: the task keeps its place, stage and fields", async () => {
		const { svc, store } = await setup();
		const view = await svc.projectsScreen();
		await svc.dropInProjects([cardIn(view.sections[0], "Back A").drop], { kind: "task", group: "project:Empty", before: null });
		expect(lines(store.text!, "Backlog")).toBe("- [ ] Back A 🗂️ Empty 📁\n\t- [ ] Step 1\n\t- [ ] Step 2\n- [ ] Back B 🗂️ P\n\t- [ ] Child\n- [ ] Back Q 🗂️ Q\n");
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

/** The review's repros: a drop that keeps a task in its stage changes nothing but its place; another stage takes it only as its column would. */
const TIMED = FILE.replace("- [ ] Now A 🗂️ P", "- [ ] Now A 🗂️ P\n- [ ] Now T 🗂️ P ⏰ 2026-11-11 14:00-15:00").replace("- [ ] Soon E 🗂️ P", "- [ ] Soon E 🗂️ P\n- [ ] Soon D 🗂️ P 📅 2026-11-20");

describe("a drop in its own stage only reorders", () => {
	it("a timed task among Today's cards keeps its time", async () => {
		for (const mode of ["byProject"] as const) {
			const { svc, store } = await setup("project:P", mode, TIMED);
			const view = await svc.projectsScreen();
			const part = view.sections[0];
			await svc.dropInProjects([cardIn(part, "Now T").drop], { kind: "task", group: part.group, before: cardIn(part, "Now A").item.key });
			expect(lines(store.text!, "Now")).toBe("- [ ] Now T 🗂️ P ⏰ 2026-11-11 14:00-15:00\n- [ ] Now A 🗂️ P\n");
		}
	});

	it("a dated Soon task keeps its date", async () => {
		for (const mode of ["byProject"] as const) {
			const { svc, store } = await setup("project:P", mode, TIMED);
			const view = await svc.projectsScreen();
			const part = view.sections[0];
			await svc.dropInProjects([cardIn(part, "Soon D").drop], { kind: "task", group: part.group, before: cardIn(part, "Soon A").item.key });
			expect(lines(store.text!, "Soon")).toContain("- [ ] Soon D 🗂️ P 📅 2026-11-20\n- [ ] Soon A 🗂️ P\n");
		}
	});
});

describe("another stage takes a card only as its column would", () => {
	it("Inbox and Backlog refuse a dated or a timed task: no place, nothing written", async () => {
		for (const mode of ["byProject"] as const) {
			for (const title of ["Soon D", "Now T"]) {
				const { svc, store } = await setup("project:P", mode, TIMED);
				const view = await svc.projectsScreen();
				const card = view.sections.flatMap((s) => s.cards).find((c) => c.item.title === title)!;
				const into = [view.sections[0]];
				for (const part of into) {
					const before = cardIn(part, "Back B").item.key;
					const place: ListPlace = { kind: "task", group: part.group, before };
					expect(projectsTakes(view, [card.drop], place)).toBe(false);
					const text = store.text;
					await svc.dropInProjects([card.drop], place);
					expect(store.text).toBe(text);
				}
			}
		}
	});

	it("an empty subproject's part takes a dated task, which keeps its stage and date", async () => {
		const { svc, store } = await setup("project:P", "byProject", TIMED);
		const view = await svc.projectsScreen();
		const place: ListPlace = { kind: "task", group: "project:Empty", before: null };
		expect(projectsTakes(view, [cardIn(view.sections[0], "Soon D").drop], place)).toBe(true);
		await svc.dropInProjects([cardIn(view.sections[0], "Soon D").drop], place);
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon E 🗂️ P\n- [ ] Soon D 🗂️ Empty 📅 2026-11-20\n");
	});
});

describe("the project swap keeps the line's order", () => {
	it("the new project takes the old one's place; one the task has already only loses the old", async () => {
		const text = FILE.replace("- [ ] Back Q 🗂️ Q", "- [ ] Back Q 🗂️ P 🗂️ Q").replace("- [ ] Inbox loose", "- [ ] Inbox loose 🗂️ P 🗂️ Sub");
		const { svc, store } = await setup("project:P", "byProject", text);
		const own = (await svc.projectsScreen()).sections[0];
		await svc.dropOnProject([cardIn(own, "Back Q").drop], "project:Empty");
		expect(store.text).toContain("- [ ] Back Q 🗂️ Empty 🗂️ Q\n");
		await svc.dropInProjects([cardIn((await svc.projectsScreen()).sections[0], "Inbox loose").drop], { kind: "task", group: "project:Sub", before: null });
		expect(store.text).toContain("- [ ] Inbox loose 🗂️ Sub\n");
	});
});

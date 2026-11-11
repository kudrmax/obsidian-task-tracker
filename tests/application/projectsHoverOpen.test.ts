import { describe, expect, it } from "vitest";
import { projectsTakes, StaleTaskError, type ProjectsDrop, type ProjectsView } from "../../core/application/contracts";
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
	"- Old",
	"\t- Older",
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
	"- [ ] Dated Q 📅 2026-11-20 🗂️ Q",
	"",
	"### Evening",
	"",
	"- [ ] Soon E 🗂️ P",
	"",
	"## Backlog",
	"",
	"- [ ] Back A 🗂️ P",
	"- [ ] Back Q 🗂️ Q",
	"\t- [ ] Q step",
	"",
	"## Done",
	"",
	"- [x] Closed 🗂️ Old",
	"- [x] Closed too 🗂️ Older",
	"",
].join("\n");

async function setup(node = "project:Q", mode: "byProject" | "byStage" = "byProject") {
	const store = new InMemoryTaskFileStore(FILE);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, memoryProjectsScreen());
	await svc.selectProjectNode(node);
	await svc.setProjectsMode(mode);
	return { store, svc };
}

const row = (view: ProjectsView, title: string) => view.rows.find((r) => r.title === title)!;
const cardOf = (view: ProjectsView, title: string) => view.sections.flatMap((s) => s.cards).find((c) => c.item.title === title)!;
const lines = (text: string, heading: string) => text.split(`## ${heading}\n\n`)[1].split("\n## ")[0];

describe("a held card opens the row it waits over: ProjectsRow.opensOnHover", () => {
	it("a live project's row and No project open; All, Done, a done project and the chosen row do not", async () => {
		const { svc } = await setup("project:P");
		await svc.unfoldProjectNode("done");
		const view = await svc.projectsScreen();
		const opens = (title: string) => row(view, title).opensOnHover;
		expect(["All", "P", "Sub", "Empty", "Q", "No project", "Done", "Old", "Older"].map(opens)).toEqual([false, false, true, true, true, true, false, false, false]);
		expect(row(view, "Empty").waiting).toBe(true);
	});

	it("No project chosen does not open again; the projects do", async () => {
		const view = await (await setup("none")).svc.projectsScreen();
		expect([row(view, "No project").opensOnHover, row(view, "P").opensOnHover]).toEqual([false, true]);
	});

	it("only a row a card may be let go on opens", async () => {
		const view = await (await setup("all")).svc.projectsScreen();
		for (const r of view.rows) if (r.opensOnHover) expect(r.acceptsTask).toBe(true);
	});
});

describe("tasks.hoverProjectNode: the row does what its row model says, in one call", () => {
	async function foldedP() {
		const ctx = await setup("project:P");
		await ctx.svc.tapProjectNode("project:P");
		expect(row(await ctx.svc.projectsScreen(), "P").folded).toBe(true);
		return ctx;
	}

	it("a folded row that opens: its branch unfolds and it is chosen, the mode kept", async () => {
		const { svc } = await foldedP();
		await svc.setProjectsMode("byStage");
		await svc.selectProjectNode("project:Q");
		expect(row(await svc.projectsScreen(), "P")).toMatchObject({ folded: true, unfoldsOnHover: true, opensOnHover: true });
		await svc.hoverProjectNode("project:P");
		const view = await svc.projectsScreen();
		expect([view.selected, view.mode, row(view, "P").folded]).toEqual(["project:P", "byStage", false]);
		expect(view.rows.map((r) => r.title)).toContain("Sub");
	});

	it("an unfolded row that opens is only chosen", async () => {
		const { svc } = await setup("project:Q");
		await svc.hoverProjectNode("project:Sub");
		expect((await svc.projectsScreen()).selected).toBe("project:Sub");
	});

	it("the chosen row, folded, only unfolds", async () => {
		const { svc } = await foldedP();
		await svc.hoverProjectNode("project:P");
		const view = await svc.projectsScreen();
		expect([view.selected, row(view, "P").folded]).toEqual(["project:P", false]);
	});

	it("All, Done and a done project are not chosen", async () => {
		const { svc } = await setup("project:Q");
		await svc.unfoldProjectNode("done");
		for (const node of ["all", "done", "project:Old"]) {
			await svc.hoverProjectNode(node);
			expect((await svc.projectsScreen()).selected).toBe("project:Q");
		}
	});

	it("through the door, kept on the device as the app hands it back", () => {
		const answer = callDoor("tasks.hoverProjectNode", ["project:P"], { tasks: FILE, nowMs: clock.now().getTime(), projectsScreen: { selected: "project:Q", folded: ["project:P"] } }) as Extract<DoorAnswer, { ok: true }>;
		expect(answer.projectsScreen).toEqual({ selected: "project:P", folded: [] });
	});
});

/** The cards carried from Q's list, read at the lift; then a held card opens P. */
async function carriedToP(mode: "byProject" | "byStage", titles: readonly string[], to = "project:P") {
	const ctx = await setup("project:Q", mode);
	const lifted = await ctx.svc.projectsScreen();
	const drops: ProjectsDrop[] = titles.map((t) => cardOf(lifted, t).drop);
	await ctx.svc.hoverProjectNode(to);
	return { ...ctx, drops, view: await ctx.svc.projectsScreen() };
}

describe("a card lifted on another project, let go in the list a held card opened", () => {
	it("each card's drop says how it was lifted, so a list that shows no card of it can judge it", async () => {
		const view = await (await setup("project:Q")).svc.projectsScreen();
		expect(cardOf(view, "Back Q").drop).toEqual({ key: cardOf(view, "Back Q").item.key, from: "Q", lifted: { id: cardOf(view, "Back Q").item.id, list: "backlog", origin: "backlog" } });
		expect(cardOf(view, "Dated Q").drop.lifted).toMatchObject({ list: "soon", origin: "day" });
	});

	it("By project: taken as the stage of the card above takes it, and P takes Q's place", async () => {
		const { svc, store, drops, view } = await carriedToP("byProject", ["Back Q"]);
		expect(view.sections[0].cards.map((c) => c.item.title)).not.toContain("Back Q");
		const place = { kind: "task", group: null, before: cardOf(view, "Now A").item.key } as const;
		expect(projectsTakes(view, drops, place)).toBe(true);
		await svc.dropInProjects(drops, place);
		expect(lines(store.text!, "Soon")).toContain("### Evening\n\n- [ ] Soon E 🗂️ P\n- [ ] Back Q 🗂️ P\n\t- [ ] Q step\n");
		expect(lines(store.text!, "Backlog")).toBe("- [ ] Back A 🗂️ P\n");
	});

	it("By project: a dated card is refused where Inbox would take it", async () => {
		const { svc, store, drops, view } = await carriedToP("byProject", ["Dated Q"]);
		const place = { kind: "task", group: null, before: cardOf(view, "Inbox A").item.key } as const;
		expect(projectsTakes(view, drops, place)).toBe(false);
		await svc.dropInProjects(drops, place);
		expect(store.text).toBe(FILE);
	});

	it("By stage: the stage moves as today, and P takes Q's place", async () => {
		const { svc, store, drops, view } = await carriedToP("byStage", ["Back Q"]);
		const place = { kind: "task", group: "soon", before: cardOf(view, "Soon E").item.key } as const;
		expect(projectsTakes(view, drops, place)).toBe(true);
		await svc.dropInProjects(drops, place);
		expect(lines(store.text!, "Soon")).toContain("- [ ] Soon B 🗂️ Sub 🗂️ Q\n- [ ] Back Q 🗂️ P\n\t- [ ] Q step\n- [ ] Dated Q");
	});

	it("By stage: Inbox and Backlog refuse a dated card; Today takes it", async () => {
		const { drops, view } = await carriedToP("byStage", ["Dated Q"]);
		expect(projectsTakes(view, drops, { kind: "task", group: "inbox", before: null })).toBe(false);
		expect(projectsTakes(view, drops, { kind: "task", group: "backlog", before: null })).toBe(false);
		expect(projectsTakes(view, drops, { kind: "task", group: "today", before: null })).toBe(true);
	});

	it("By stage, No project opened: the project it was lifted under goes", async () => {
		const { svc, store, drops, view } = await carriedToP("byStage", ["Back Q"], "none");
		await svc.dropInProjects(drops, { kind: "task", group: "inbox", before: null });
		expect(view.selected).toBe("none");
		expect(lines(store.text!, "Inbox")).toBe("- [ ] Inbox A 🗂️ P\n- [ ] Inbox loose\n- [ ] Back Q\n\t- [ ] Q step\n");
	});

	it("By stage: a carried card the opened list shows keeps its projects, as today", async () => {
		const { svc, store, drops } = await carriedToP("byStage", ["Soon B"], "project:Sub");
		await svc.dropInProjects(drops, { kind: "task", group: "backlog", before: null });
		expect(lines(store.text!, "Backlog")).toContain("- [ ] Soon B 🗂️ Sub 🗂️ Q\n");
	});

	it("a card lifted elsewhere and a card of the opened list go together", async () => {
		const { svc, store, view, drops } = await carriedToP("byStage", ["Back Q"]);
		await svc.dropInProjects([...drops, cardOf(view, "Inbox A").drop], { kind: "task", group: "backlog", before: null });
		expect(lines(store.text!, "Backlog")).toBe("- [ ] Back A 🗂️ P\n- [ ] Inbox A 🗂️ P\n- [ ] Back Q 🗂️ P\n\t- [ ] Q step\n");
	});

	it("a subtask lifted elsewhere nests under a task of the opened list, as today", async () => {
		const ctx = await setup("project:Q");
		const sub = (await ctx.svc.projectsScreen()).sections.flatMap((s) => s.rows).find((r) => r.item.title === "Q step")!;
		await ctx.svc.hoverProjectNode("project:P");
		const view = await ctx.svc.projectsScreen();
		await ctx.svc.dropInProjects([sub.drop], { kind: "subtask", parent: cardOf(view, "Back A").item.key, before: null });
		expect(lines(ctx.store.text!, "Backlog")).toBe("- [ ] Back A 🗂️ P\n\t- [ ] Q step\n- [ ] Back Q 🗂️ Q\n");
	});

	it("the preview lands it on the opened project's list, equal to the screen the drop leaves", async () => {
		const { svc, drops, view } = await carriedToP("byStage", ["Back Q"]);
		const place = { kind: "task", group: "soon", before: cardOf(view, "Soon E").item.key } as const;
		const preview = await svc.projectsDropPreview(drops, place);
		expect(preview.landings[0]).toMatchObject({ kind: "card", id: drops[0].lifted!.id, section: "soon", index: 2, item: expect.objectContaining({ title: "Back Q" }) });
		await svc.dropInProjects(drops, place);
		expect(await svc.projectsScreen()).toEqual(preview.view);
	});

	it("a card the list does not show and whose lift it is not told stays stale", async () => {
		const { svc, drops, view } = await carriedToP("byProject", ["Back Q"]);
		const bare = drops.map(({ key, from }) => ({ key, from }));
		expect(() => projectsTakes(view, bare, { kind: "task", group: null, before: null })).toThrow(StaleTaskError);
		await expect(svc.dropInProjects(bare, { kind: "task", group: null, before: null })).rejects.toBeInstanceOf(StaleTaskError);
	});
});

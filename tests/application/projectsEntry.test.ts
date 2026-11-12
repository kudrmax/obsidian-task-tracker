import { describe, expect, it } from "vitest";
import { type EntryList, type ListCard, projectsEntryLook, projectsPlusTakes, type ProjectsView, QuickEntrySession, viewEntryLists, type TaskItem, type WriteLine } from "../../core/application/contracts";
import { callDoor } from "../../core/application/PhoneCalls";
import { memoryProjectsScreen, type Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const clock: Clock = { now: () => new Date(2026, 10, 11, 12, 0) };
const TODAY = "2026-11-11";

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
	"## Backlog",
	"",
	"- [ ] Back A 🗂️ P",
	"- [ ] Back B 🗂️ P",
	"\t- [ ] Child",
	"",
	"## Done",
	"",
].join("\n");

class Writes implements WriteLine {
	private tail: Promise<void> = Promise.resolve();
	readonly errors: unknown[] = [];

	push(job: () => Promise<void>): void {
		this.tail = this.tail.then(job).catch((error: unknown) => void this.errors.push(error));
	}

	async idle(): Promise<void> {
		let tail: Promise<void>;
		do {
			tail = this.tail;
			await tail;
		} while (tail !== this.tail);
	}
}

/**
 * The Projects screen with the quick entry over it, as a frontend wires it: the Projects list is what `projectsEntryLook`
 * gives of the view shown, the funnel's columns are drawn but hidden (`hidden`: the cards they hold), and the screen
 * shows what `viewEntryLists("byProject", place)` says.
 */
async function projectsScreen(node = "project:P", _mode: "byProject" | "byStage" = "byProject", text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, new UndoHistory(store), undefined, memoryProjectsScreen());
	await svc.selectProjectNode(node);
	let view: ProjectsView = await svc.projectsScreen();
	const hidden: Partial<Record<EntryList, ListCard[]>> = {};
	const look = () => projectsEntryLook(view);
	const writes = new Writes();
	const entry = new QuickEntrySession(
		svc,
		{
			cards: (column) => (column === "projects" ? look().cards : (hidden[column] ?? [])),
			sections: (column) => (column === "projects" ? look().sections : []),
			sectioned: () => false,
			parts: (column) => (column === "projects" ? look().parts : []),
			day: () => TODAY,
			today: () => TODAY,
			shown: () => viewEntryLists("byProject", "inbox"),
			fresh: async (beforeShow) => {
				view = await svc.projectsScreen();
				beforeShow?.((column) => (column === "projects" ? look().cards : []));
			},
			onChange: () => undefined,
		},
		writes,
	);
	const item = (title: string): TaskItem => view.sections.flatMap((s) => s.rows).find((row) => row.item.title === title)!.item;
	const titles = (group: string | null) => view.sections.find((s) => s.group === group)!.rows.map((row) => `${"\t".repeat(row.level)}${row.item.title}`);
	return { store, svc, entry, writes, item, hidden, titles, view: () => view, refresh: async () => void (view = await svc.projectsScreen()) };
}

const lines = (text: string | null, heading: string) => (text ?? "").split(`## ${heading}\n\n`)[1].split("\n## ")[0].trim().split("\n");

describe("the entry on the Projects screen (Max, 2026-11-11: «Rename для задач не работает в проектах»)", () => {
	it("Rename on a Projects card stands the field in the Projects list, not in the funnel's hidden column that holds the same task", async () => {
		const s = await projectsScreen();
		const card = s.item("Inbox A");
		s.hidden.inbox = [{ key: card.key, id: card.id, level: 0, group: null }];
		const spot = s.entry.renameSpot(card, false);
		expect(spot).toMatchObject({ kind: "list", column: "projects" });
		s.entry.open(spot!, card);
		expect(s.entry.state).toMatchObject({ text: "Inbox A", spot: { kind: "list", column: "projects" } });
		expect(s.entry.listEntry("projects")).not.toBeNull();
		expect(s.entry.listEntry("inbox")).toBeNull();
	});

	it("Enter writes the new title in place and the next field opens under the card in the Projects list", async () => {
		const s = await projectsScreen();
		const card = s.item("Back A");
		s.entry.open(s.entry.renameSpot(card, false)!, card);
		s.entry.type("Back A renamed");
		s.entry.enter();
		await s.entry.idle();
		expect(lines(s.store.text, "Backlog")[0]).toBe("- [ ] Back A renamed 🗂️ P");
		expect(s.entry.state).toMatchObject({ spot: { kind: "list", column: "projects" }, renaming: null, project: { lit: true } });
	});

	it("Escape and a blank title cancel the rename, writing nothing", async () => {
		const s = await projectsScreen();
		const before = s.store.text;
		const card = s.item("Soon A");
		s.entry.open(s.entry.renameSpot(card, false)!, card);
		s.entry.escape();
		s.entry.open(s.entry.renameSpot(card, false)!, card);
		s.entry.type("  ");
		s.entry.enter();
		await s.entry.idle();
		expect(s.entry.state).toBeNull();
		expect(s.store.text).toBe(before);
	});

	it("renames a subtask in the Projects list too", async () => {
		const s = await projectsScreen();
		const child = s.item("Child");
		const spot = s.entry.renameSpot(child, false);
		expect(spot).toMatchObject({ kind: "list", column: "projects", place: { level: 1 } });
		s.entry.open(spot!, child);
		s.entry.type("Child renamed");
		s.entry.blur();
		await s.entry.idle();
		expect(lines(s.store.text, "Backlog")).toContain("\t- [ ] Child renamed");
	});

	it("Add Subtask opens the field under the card in the Projects list and writes the subtask there", async () => {
		const s = await projectsScreen();
		const spot = s.entry.subtaskSpot(s.item("Back B").key);
		expect(spot).toMatchObject({ kind: "list", column: "projects", place: { level: 1 } });
		s.entry.open(spot);
		expect(s.entry.state).toMatchObject({ place: null, project: null });
		s.entry.type("Step");
		s.entry.enter();
		await s.entry.idle();
		expect(lines(s.store.text, "Backlog")).toEqual(["- [ ] Back A 🗂️ P", "- [ ] Back B 🗂️ P", "\t- [ ] Child", "\t- [ ] Step"]);
		expect(s.entry.state).toMatchObject({ spot: { column: "projects", place: { level: 1 } } });
	});

	it("Add Subtask on a subtask folded away under its card unfolds it in the Projects list and types there", async () => {
		const s = await projectsScreen("project:P", "byProject", FILE.replace("- [ ] Back B 🗂️ P", "- [ ] Back B 🗂️ P 📁"));
		expect(s.titles(null)).not.toContain("\tChild");
		const child = (await s.svc.projectsScreen()).sections[0].cards.find((c) => c.item.title === "Back B")!.item.subtasks[0];
		const spot = s.entry.subtaskSpot(child.key);
		expect(spot).toMatchObject({ kind: "list", column: "projects", unfold: child.key });
		s.entry.open(spot);
		await s.entry.idle();
		expect(s.titles(null)).toContain("\tChild");
		expect(s.entry.state).toMatchObject({ spot: { kind: "list", column: "projects", place: { level: 2 } } });
	});

	it("a tap on an empty part's No tasks plate types a task of that part: its project, Inbox, and Enter types the next one there", async () => {
		const s = await projectsScreen();
		const empty = s.view().sections.find((section) => section.title === "Empty")!;
		expect(empty.plate).toBe(true);
		s.entry.openIn("projects", empty.group);
		expect(s.entry.state).toMatchObject({ spot: { column: "projects", place: { group: empty.group } }, place: { kind: "inbox" }, project: { lit: true } });
		s.entry.type("First");
		s.entry.enter();
		s.entry.type("Second");
		s.entry.enter();
		await s.entry.idle();
		expect(lines(s.store.text, "Inbox")).toEqual(["- [ ] Inbox A 🗂️ P", "- [ ] Inbox loose", "- [ ] First 🗂️ Empty", "- [ ] Second 🗂️ Empty"]);
		expect(s.titles(empty.group)).toEqual(["First", "Second"]);
		const first = projectsEntryLook(s.view()).cards.findIndex((c) => c.group === empty.group);
		expect(s.entry.state).toMatchObject({ spot: { column: "projects", place: { group: empty.group, index: first + 2 } } });
	});

	it("By project, a task typed between cards goes where its part writes (Inbox), next to the part's Inbox cards", async () => {
		const s = await projectsScreen();
		expect(s.titles(null)).toEqual(["Inbox A", "Back A", "Back B", "\tChild", "Soon A", "Now A"]);
		s.entry.openAt("projects", { kind: "task", group: null, before: s.item("Soon A").key });
		s.entry.type("Typed");
		s.entry.enter();
		await s.entry.idle();
		expect(lines(s.store.text, "Inbox")).toEqual(["- [ ] Inbox A 🗂️ P", "- [ ] Typed 🗂️ P", "- [ ] Inbox loose"]);
	});

	it("the plus tapped on the Projects screen types at the end of the node's own part, never in a funnel column", async () => {
		const s = await projectsScreen();
		s.entry.openFromPlus();
		expect(s.entry.state).toMatchObject({ spot: { kind: "list", column: "projects", place: { group: null } }, place: { kind: "inbox" } });
	});

	/** QA 2026-11-12: the field typed at a part's end stands where its card will: after the part's cards of its stage. */
	it("the plus's field stands where the typed card lands, after the part's Inbox cards; Enter keeps them together", async () => {
		const s = await projectsScreen();
		const at = (title: string) => projectsEntryLook(s.view()).cards.findIndex((c) => c.key.raw === s.item(title).key.raw);
		s.entry.openFromPlus();
		expect(s.entry.state).toMatchObject({ spot: { column: "projects", place: { group: null, index: at("Back A") } } });
		s.entry.type("Typed");
		s.entry.enter();
		await s.entry.idle();
		expect(s.titles(null)).toEqual(["Inbox A", "Typed", "Back A", "Back B", "\tChild", "Soon A", "Now A"]);
		expect(s.entry.state).toMatchObject({ spot: { column: "projects", place: { group: null, index: at("Back A") } } });
	});

	it("a part's end for a stage it has no card of: after the stages before it", async () => {
		const s = await projectsScreen();
		const part = projectsEntryLook(s.view()).parts.find((p) => p.group === null)!;
		expect(part.end).toEqual(s.item("Back A").key);
		const sub = s.view().sections.find((x) => x.title === "Sub")!;
		expect(projectsEntryLook(s.view()).parts.find((p) => p.group === sub.group)!.end).toEqual(sub.cards[0].item.key);
		const empty = s.view().sections.find((x) => x.title === "Empty")!;
		expect(projectsEntryLook(s.view()).parts.find((p) => p.group === empty.group)!.end).toBeNull();
	});

	it("on Done no part takes the plus: the plus opens nothing, never the hidden Inbox, and says so before the tap", async () => {
		const s = await projectsScreen("done");
		expect(s.entry.plusOpens()).toBe(false);
		expect(s.entry.openFromPlus()).toBe(false);
		expect(s.entry.state).toBeNull();
		const p = await projectsScreen();
		expect(p.entry.plusOpens()).toBe(true);
		expect(p.entry.openFromPlus()).toBe(true);
	});

	it("off the Projects screen the plus opens in the day list or Inbox, as before", async () => {
		const s = await projectsScreen();
		const screen = new QuickEntrySession(s.svc, { cards: () => [], sections: () => [], sectioned: () => false, day: () => TODAY, today: () => TODAY, shown: () => viewEntryLists("twoColumns", "inbox"), fresh: async () => undefined, onChange: () => undefined }, s.writes);
		expect(screen.plusOpens()).toBe(true);
		expect(screen.openFromPlus()).toBe(true);
		expect(screen.state).toMatchObject({ spot: { kind: "list", column: "inbox" } });
	});

	it("a place chosen in the bar keeps the field where it stands on the Projects screen: the screen does not turn, the task goes there", async () => {
		const s = await projectsScreen();
		s.entry.openIn("projects", null);
		const spot = s.entry.state!.spot;
		const move = s.entry.choosePlace({ kind: "soon" });
		expect(move).toEqual({ column: "projects", day: null });
		expect(s.entry.state).toMatchObject({ spot, place: { kind: "soon" } });
		s.entry.type("Later");
		s.entry.enter();
		await s.entry.idle();
		expect(lines(s.store.text, "Soon")).toContain("- [ ] Later 🗂️ P");
		expect(s.entry.state).toMatchObject({ spot: { column: "projects" }, place: { kind: "soon" } });
	});

	it("a rename moved by the bar's place stays in the Projects list and the task moves", async () => {
		const s = await projectsScreen();
		const card = s.item("Back A");
		s.entry.open(s.entry.renameSpot(card, false)!, card);
		expect(s.entry.choosePlace({ kind: "soon" })).toEqual({ column: "projects", day: null });
		expect(s.entry.state).toMatchObject({ spot: { column: "projects" }, place: { kind: "soon" } });
		s.entry.enter();
		await s.entry.idle();
		expect(lines(s.store.text, "Soon")).toContain("- [ ] Back A 🗂️ P");
	});

	it("only the by project view shows the Projects list; every other view its funnel lists", () => {
		expect(viewEntryLists("byProject", "calendar")).toEqual(["projects"]);
		expect(viewEntryLists("twoColumns", "inbox")).toEqual(["inbox", "backlog", "soon"]);
	});

	it("the Projects list's look: its rows as cards in their parts, the parts' writes, the plus on the node's own part", async () => {
		const s = await projectsScreen();
		const look = projectsEntryLook(s.view());
		expect(look.cards.map((c) => [c.key.raw.trim(), c.level, c.group])).toContainEqual(["- [ ] Child", 1, null]);
		expect(look.sections).toEqual(s.view().sections.map((x) => x.group));
		expect(look.parts.filter((p) => p.plus).map((p) => p.group)).toEqual([null]);
		expect(projectsEntryLook(null)).toEqual({ cards: [], sections: [], parts: [] });
	});

	it("the door: a Projects entry over the wire, the look from `rules.projectsEntryLook`", async () => {
		const s = await projectsScreen();
		const look = projectsEntryLook(s.view());
		const wire = { cards: { projects: look.cards }, sections: { projects: look.sections }, parts: { projects: look.parts }, day: TODAY, shown: ["projects"] };
		const context = { tasks: FILE, settings: "", now: "2026-11-11T12:00:00" };
		const card = s.item("Inbox A");
		const spot = callDoor("entry.renameSpot", [null, wire, card, false], context as never);
		expect(spot).toMatchObject({ ok: true, result: { value: { kind: "list", column: "projects" } } });
		const opened = callDoor("entry.openIn", [null, wire, "projects", null], context as never);
		expect(opened).toMatchObject({ ok: true, result: { state: { spot: { column: "projects" }, place: { kind: "inbox" } } } });
		expect(callDoor("rules.viewEntryLists", ["byProject", "inbox"], context as never)).toMatchObject({ ok: true, result: ["projects"] });
		const none = { ...wire, cards: {}, sections: {}, parts: { projects: [] } };
		expect(callDoor("entry.plusOpens", [null, none], context as never)).toMatchObject({ ok: true, result: { value: false, state: null } });
		expect(callDoor("entry.openFromPlus", [null, none], context as never)).toMatchObject({ ok: true, result: { value: false, state: null } });
	});

	describe("a folder chosen (`- Work 🗃️`): its own part writes no task", () => {
		const FOLDER = FILE.replace("- Q\n", "- Q\n- Work 🗃️\n\t- Sub2\n").replace("- [ ] Inbox loose", "- [ ] Inbox loose\n- [ ] In sub 🗂️ Sub2\n- [ ] By hand 🗂️ Work");

		for (const mode of ["byProject", "byStage"] as const) {
			it(`${mode}: no part takes the plus, so a tap on it opens nothing`, async () => {
				const s = await projectsScreen("project:Work", mode, FOLDER);
				expect(s.view().newTask).toBeNull();
				expect(projectsEntryLook(s.view()).parts.some((p) => p.plus)).toBe(false);
				expect(s.entry.plusOpens()).toBe(false);
				expect(s.entry.openFromPlus()).toBe(false);
				expect(s.entry.state).toBeNull();
			});
		}

		it("All, no filter: the plus types in No project's part, a task with no project", async () => {
			const s = await projectsScreen("all", "byProject", FOLDER);
			const look = projectsEntryLook(s.view());
			expect(look.parts.filter((p) => p.plus).map((p) => p.group)).toEqual(["none"]);
		});

		it("the plus may be let go only where a new task may be written: a subproject's gap and under its tasks, never in the folder's own part or under a task carrying the folder", async () => {
			const s = await projectsScreen("project:Work", "byProject", FOLDER);
			const view = s.view();
			const own = view.sections.find((x) => x.group === null)!;
			const sub = view.sections.find((x) => x.title === "Sub2")!;
			expect(own.cards.map((c) => c.item.title)).toEqual(["By hand"]);
			expect(projectsPlusTakes(view, { kind: "task", group: null, before: null })).toBe(false);
			expect(projectsPlusTakes(view, { kind: "subtask", parent: s.item("By hand").key, before: null })).toBe(false);
			expect(projectsPlusTakes(view, { kind: "task", group: sub.group, before: null })).toBe(true);
			expect(projectsPlusTakes(view, { kind: "subtask", parent: s.item("In sub").key, before: null })).toBe(true);
			expect(projectsPlusTakes(view, { kind: "task", group: "project:Gone", before: null })).toBe(false);
		});

		it("under Done the plus is let go nowhere", async () => {
			const s = await projectsScreen("done", "byProject", FILE.replace("## Done\n", "## Done\n\n- [x] Closed 🗂️ Q\n"));
			for (const section of s.view().sections) expect(projectsPlusTakes(s.view(), { kind: "task", group: section.group, before: null })).toBe(false);
		});

		it("the door answers it as `rules.projectsPlusTakes`", async () => {
			const s = await projectsScreen("project:Work", "byProject", FOLDER);
			const context = { tasks: FOLDER, settings: "", now: "2026-11-11T12:00:00" };
			expect(callDoor("rules.projectsPlusTakes", [s.view(), { kind: "task", group: null, before: null }], context as never)).toMatchObject({ ok: true, result: false });
		});
	});
});

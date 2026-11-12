import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import type { ProjectsView } from "../../core/application/contracts";

const nowMs = new Date(2026, 10, 11, 12, 0).getTime();
const file = ["## Inbox", "", "- [ ] Voice 🗂️ Small talk", "", "## Projects", "", "- Дружба [[Моя заметка]]", "\t- Small talk", "", "## Now", "", "- [ ] Call 🗂️ Дружба", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

type Ok = Extract<DoorAnswer, { ok: true }>;
const call = (method: string, args: unknown[], extra: Partial<DoorContext> = {}) => callDoor(method, args, { tasks: file, nowMs, ...extra }) as Ok;

describe("the door's Projects screen", () => {
	it("keeps the device's screen as the app hands it back: a pick answers it, the next read draws it", () => {
		const picked = call("tasks.pickProjectNode", ["project:Дружба", true]);
		expect(picked.projectsScreen).toEqual({ selected: "project:Дружба" });
		const view = call("tasks.projectsScreen", [], { projectsScreen: picked.projectsScreen }).result as ProjectsView;
		expect(view).toMatchObject({ selected: "project:Дружба", title: "Дружба" });
		expect(view.sections.map((s) => [s.title, s.cards.map((c) => c.item.title)])).toEqual([
			[null, ["Call"]],
			["Small talk", ["Voice"]],
		]);
	});

	it("drops a card on a row and makes, moves, renames a project, each a step of undo", () => {
		const view = call("tasks.projectsScreen", []).result as ProjectsView;
		const voice = view.sections.flatMap((s) => s.cards).find((c) => c.item.title === "Voice")!;
		const dropped = call("tasks.dropOnProject", [[voice.drop], "project:Дружба"]);
		expect(dropped.step).toBe(true);
		expect(dropped.tasks).toContain("- [ ] Voice 🗂️ Дружба\n");
		const made = call("tasks.createProject", ["Старые друзья", { parent: "Дружба", before: null }]);
		expect(made.result).toMatchObject({ name: "Старые друзья", path: ["Дружба", "Старые друзья"] });
		expect(made.projectsScreen).toMatchObject({ selected: "project:Старые друзья" });
		expect(call("tasks.renameProject", ["Small talk", "Разговоры"]).tasks).toContain("- [ ] Voice 🗂️ Разговоры\n");
	});

	it("opens an attached note in Obsidian", () => {
		const view = call("tasks.projectsScreen", [], { projectsScreen: { selected: "project:Дружба" } }).result as ProjectsView;
		expect(call("projects.noteUrl", [view.menu!.note!.link, "Obsidian"]).result).toBe("obsidian://open?vault=Obsidian&file=%D0%9C%D0%BE%D1%8F%20%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B0");
	});
});

describe("the Project page of a menu read over the settings alone", () => {
	it("offers the whole tree the screen it is opened over gives (`screen.projectTree` handed in as the menu's `projects`)", () => {
		const screen = call("tasks.screen", ["2026-11-11"]).result as { projectTree: unknown[]; inbox: { json?: unknown }[]; offer: unknown };
		expect((screen.projectTree as { name: string }[]).map((p) => p.name)).toEqual(["Дружба", "Small talk"]);
		const item = (screen.inbox as unknown[])[0];
		const menu = callDoor("tasks.menu", [item, "inbox", { today: "2026-11-11", day: "2026-11-11", offer: screen.offer, projects: screen.projectTree }], { tasks: null, nowMs }) as Ok;
		expect((menu.result as { project: { options: { project: { name: string }; depth: number; checked: boolean }[] } }).project.options.map((o) => [o.project.name, o.depth, o.checked])).toEqual([
			["Дружба", 0, false],
			["Small talk", 1, true],
		]);
	});
});

describe("the door's old names, kept answering for an app that still calls them", () => {
	it("days.stepScreen walks as days.stepFunnel, the old Projects place as Done", () => {
		expect(call("days.stepScreen", [{ mode: "inbox", date: "2026-11-11" }, 1]).result).toEqual({ mode: "soon", date: "2026-11-11" });
		expect(call("days.stepScreen", [{ mode: "inbox", date: "2026-11-11" }, -1]).result).toBeNull();
		expect(call("days.stepScreen", [{ mode: "projects", date: "2026-11-11" }, 1]).result).toEqual({ mode: "inbox", date: "2026-11-11" });
	});

	it("rules.placeShowing, shownLists and shownEntryLists read the funnel's places, the old Projects place as Inbox", () => {
		expect(call("rules.placeShowing", ["day", "inbox"]).result).toBe("soon");
		expect(call("rules.placeShowing", ["day", "projects"]).result).toBe("soon");
		expect(call("rules.placeShowing", ["projects", "soon"]).result).toBe("soon");
		expect(call("rules.shownLists", ["soon"]).result).toEqual(["soon", "day"]);
		expect(call("rules.shownLists", ["projects"]).result).toEqual([]);
		expect(call("rules.shownEntryLists", ["projects"]).result).toEqual(["projects"]);
		expect(call("rules.shownEntryLists", ["inbox"]).result).toEqual(["inbox", "backlog", "soon"]);
	});

	it("tasks.tapProjectNode, unfoldProjectNode, hoverProjectNode and setProjectsMode still answer", () => {
		expect(call("tasks.tapProjectNode", ["project:Дружба"]).projectsScreen).toMatchObject({ selected: "project:Дружба" });
		expect(call("tasks.hoverProjectNode", ["project:Дружба"]).projectsScreen).toMatchObject({ selected: "project:Дружба" });
		expect(call("tasks.unfoldProjectNode", ["done"]).projectsScreen).toMatchObject({ doneOpen: true });
		expect(call("tasks.setProjectsMode", ["byStage"]).ok).toBe(true);
	});
});

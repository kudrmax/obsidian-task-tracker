import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import type { ProjectsView } from "../../core/application/contracts";

const nowMs = new Date(2026, 10, 11, 12, 0).getTime();
const file = ["## Inbox", "", "- [ ] Voice 🗂️ Small talk", "", "## Projects", "", "- Дружба [[Моя заметка]]", "\t- Small talk", "", "## Now", "", "- [ ] Call 🗂️ Дружба", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

type Ok = Extract<DoorAnswer, { ok: true }>;
const call = (method: string, args: unknown[], extra: Partial<DoorContext> = {}) => callDoor(method, args, { tasks: file, nowMs, ...extra }) as Ok;

describe("the door's Projects screen", () => {
	it("keeps the device's screen as the app hands it back: a tap answers it, the next read draws it", () => {
		const tapped = call("tasks.tapProjectNode", ["project:Дружба"]);
		expect(tapped.projectsScreen).toEqual({ selected: "project:Дружба" });
		const moded = call("tasks.setProjectsMode", ["byStage"], { projectsScreen: tapped.projectsScreen });
		const view = call("tasks.projectsScreen", [], { projectsScreen: moded.projectsScreen }).result as ProjectsView;
		expect(view).toMatchObject({ selected: "project:Дружба", mode: "byStage", title: "Дружба" });
		expect(view.sections.map((s) => [s.title, s.cards.map((c) => [c.item.title, c.over])])).toEqual([
			["Today", [["Call", null]]],
			["Inbox", [["Voice", "Small talk"]]],
		]);
	});

	it("drops a card on a row and makes, moves, renames a project, each a step of undo", () => {
		const view = call("tasks.projectsScreen", []).result as ProjectsView;
		const voice = view.sections.flatMap((s) => s.cards).find((c) => c.item.title === "Voice")!;
		const dropped = call("tasks.dropOnProject", [[voice.item.key], voice.from, "project:Дружба"]);
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

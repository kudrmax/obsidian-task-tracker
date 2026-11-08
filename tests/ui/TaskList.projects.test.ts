// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ListGrouping, ProjectRef, TaskItem } from "../../core/application/contracts";
import { listGrouping, ProjectIndex, viewGrouping } from "../../core/application/projects";
import { TaskList } from "../../obsidian/ui/TaskList";
import { onDay } from "../fakes/itemOnDay";
import { type PlacedHead, placeAt } from "../../obsidian/ui/drag/listPlace";

const ENV = { name: "Окружение", path: "Окружение.md", link: "Окружение" };
const HAPPY = { name: "Стать счастливым", path: "Стать счастливым.md", link: "Стать счастливым" };
const index = new ProjectIndex([ENV, HAPPY]);
const ref = (link: string): ProjectRef => index.refOf(link)!;

const task = (text: string, i: number, project: string | null, group: string | null = null): TaskItem =>
	onDay({ key: { section: "backlog", index: i, path: [], raw: text }, text, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group, subtasks: [], progress: null, parentText: null, description: null, list: "backlog", isSubtask: false, project: project ? ref(project) : null }, "2026-11-07");

const ITEMS = [task("Клуб", 0, "Окружение"), task("Испанский", 1, null), task("Ужин", 2, "Окружение"), task("Встреча", 3, "Окружение", "Дальний"), task("Велосипед", 4, null, "Дальний")];
const SECTIONS = [{ name: null, empty: false }, { name: "Дальний", empty: false }] as never;

function grouped(state = {}): ListGrouping {
	return listGrouping({ list: "backlog", items: ITEMS, sections: SECTIONS, projects: index, state });
}

function draw(grouping: ListGrouping): TaskList {
	const list = new TaskList(document.createElement("div"), { items: () => ITEMS, day: () => null, grouped: () => true, sections: () => SECTIONS, grouping: () => grouping, ungroupedName: () => "No section" });
	list.render();
	return list;
}

const rows = (list: TaskList) =>
	list.elements.map((node) => (node.classList.contains("is-project") ? `# ${node.querySelector(".tc-group-name")?.textContent}${node.querySelector(".tc-group-count") ? ` (${node.querySelector(".tc-group-count")?.textContent})` : ""}` : node.classList.contains("tc-group-head") ? `## ${node.textContent}` : node.classList.contains("tc-group-empty") ? "[No tasks]" : node.querySelector(".tc-card-title")?.textContent));

describe("a list grouped by project", () => {
	it("draws each project's group, its tasks without a section first, then its sections; No project last", () => {
		expect(rows(draw(grouped()))).toEqual(["# Окружение", "Клуб", "Ужин", "## Дальний", "Встреча", "# Стать счастливым", "[No tasks]", "# No project", "Испанский", "## Дальний", "Велосипед"]);
	});

	it("folded, a group shows its count and none of its tasks", () => {
		expect(rows(draw(grouped({ folded: { backlog: ["окружение"] } })))).toEqual(["# Окружение (3)", "# Стать счастливым", "[No tasks]", "# No project", "Испанский", "## Дальний", "Велосипед"]);
	});

	it("knows the folded group's header each of its tasks is held behind, and no header for a task shown", () => {
		const list = draw(grouped({ folded: { backlog: ["окружение"] } }));
		const head = list.foldedHeadOf(ITEMS[3].id);
		expect(head?.querySelector(".tc-group-name")?.textContent).toBe("Окружение");
		expect(list.foldedHeadOf(ITEMS[0].id)).toBe(head);
		expect(list.foldedHeadOf(ITEMS[1].id)).toBeNull();
	});

	it("gives a project with a note the arrow and No project none", () => {
		const heads = draw(grouped()).elements.filter((n) => n.classList.contains("is-project"));
		expect(heads.map((h) => h.querySelector(".tc-group-open") !== null)).toEqual([true, true, false]);
	});

	it("names each card's and header's project part for the places", () => {
		const list = draw(grouped());
		expect(list.listCards.map((c) => [c.group, c.project])).toEqual([[null, "Окружение"], [null, "Окружение"], ["Дальний", "Окружение"], [null, null], ["Дальний", null]]);
		expect(list.sections).toEqual([{ group: null, project: "Окружение" }, { group: "Дальний", project: "Окружение" }, { group: null, project: "Стать счастливым" }, { group: null, project: null }, { group: "Дальний", project: null }]);
		const heads = list.elements.flatMap((n) => (list.headerAt(n) === undefined ? [] : [list.headerAt(n)]));
		expect(heads[0]).toEqual({ group: null, project: "Окружение" });
		expect(heads[1]).toEqual({ group: "Дальний", project: "Окружение" });
	});

	it("draws the plain list as today while grouping is off", () => {
		const list = draw({ canGroup: true, on: false, groups: [] });
		expect(rows(list)).toEqual(["## No section", "Клуб", "Испанский", "Ужин", "## Дальний", "Встреча", "Велосипед"]);
		expect(list.listCards.every((c) => c.project === undefined)).toBe(true);
	});

	it("draws a project's view as one untitled group: no project header, every card and plate in the project's part", () => {
		const own = ITEMS.filter((item) => item.project !== null);
		const view = viewGrouping(ref("Окружение"), own, true, SECTIONS);
		const list = new TaskList(document.createElement("div"), { items: () => own, day: () => null, grouped: () => true, sections: () => SECTIONS, grouping: () => view, ungroupedName: () => "No section" });
		list.render();
		expect(rows(list)).toEqual(["## No section", "Клуб", "Ужин", "## Дальний", "Встреча"]);
		expect(list.listCards.every((c) => c.project === "Окружение")).toBe(true);
		const empty = new TaskList(document.createElement("div"), { items: () => [], day: () => null, grouping: () => viewGrouping(ref("Окружение"), [], false, []) });
		empty.render();
		expect(rows(empty)).toEqual(["[No tasks]"]);
		expect(empty.plateOf(null, "Окружение")).not.toBeNull();
	});
});

describe("placeAt among project groups", () => {
	const H = 35;
	const cards = [
		{ key: { section: "backlog" as const, index: 0, path: [], raw: "a" }, level: 0, group: null, project: "P", top: 26, height: H },
		{ key: { section: "backlog" as const, index: 1, path: [], raw: "b" }, level: 0, group: null, project: null, top: 26 + 37 + 36, height: H },
	];
	const heads: PlacedHead[] = [
		{ group: { group: null, project: "P" }, opens: true, firstCard: 0, top: 0, height: 26 },
		{ group: { group: null, project: "Q" }, opens: true, firstCard: 1, top: 63, height: 26 },
		{ group: { group: null, project: null }, opens: true, firstCard: 1, top: 99 - 26 + 10, height: 26 },
	];

	it("a finger above the first group is in it, never outside every group", () => {
		expect(placeAt(cards, 2, 0, 0, null, heads)).toMatchObject({ index: 0, group: null, project: "P" });
	});

	it("a finger past a folded group's header lands in that group", () => {
		expect(placeAt(cards, 63 + 20, 0, 0, null, heads)).toMatchObject({ index: 1, project: "Q" });
	});

	it("past the last header, the next group's part", () => {
		expect(placeAt(cards, 99, 0, 0, null, heads)).toMatchObject({ index: 1, project: null });
	});
});

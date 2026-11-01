// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { editRows, nextPriority, priorityTiles, statusTiles, TaskMenu, tileRows } from "../../src/ui/menu/TaskMenu";

const item = (extra: Partial<TaskItem> = {}): TaskItem => ({ key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, ...extra });

const LEVELS = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
] as const;

describe("the status group", () => {
	it("offers Done first, then In progress and Won’t do", () => {
		const tiles = statusTiles(item());
		expect(tiles.map((t) => t.id)).toEqual(["done", "progress", "wontdo"]);
		expect(tiles.map((t) => t.label)).toEqual(["Done", "In progress", "Won’t do"]);
	});

	it("turns In progress into Stop progress for a task in progress", () => {
		expect(statusTiles(item({ status: "inProgress" }))[1].label).toBe("Stop progress");
	});
});

describe("the edit group", () => {
	it("holds Rename, Due date with the date beside it, and Add subtask", () => {
		const rows = editRows(item({ dueDate: "2026-11-03", description: "- note" }));
		expect(rows.map((r) => r.id)).toEqual(["rename", "due", "subtask"]);
		expect(rows[1].value).toBe("3 Nov");
	});

	it("offers Add description after Rename for a task without one", () => {
		const rows = editRows(item());
		expect(rows.map((r) => r.label)).toEqual(["Rename", "Add description", "Due date", "Add subtask"]);
		expect(rows[1].icon).toBe("description");
	});

	it("shows no date beside Due date without one", () => {
		expect(editRows(item({ description: "- note" }))[1].value).toBe("");
	});
});

describe("the priority group", () => {
	it("has a tile per level in the settings' order, the task's own on", () => {
		expect(priorityTiles(item({ priority: LEVELS[1] }), LEVELS)).toEqual([
			{ prefix: "p1", color: "red", on: false },
			{ prefix: "p2", color: "orange", on: true },
		]);
		expect(priorityTiles(item(), LEVELS).some((t) => t.on)).toBe(false);
	});

	it("sets another level, and takes the priority off on the task's own", () => {
		expect(nextPriority(item({ priority: LEVELS[1] }), "p1")).toBe("p1");
		expect(nextPriority(item(), "p2")).toBe("p2");
		expect(nextPriority(item({ priority: LEVELS[1] }), "p2")).toBeNull();
	});

	it("lays the tiles in even rows of at most three, so no row is left with a hole", () => {
		const sizes = (n: number) => tileRows(Array.from({ length: n }, (_, i) => i)).map((row) => row.length);
		expect([1, 2, 3, 4, 5, 6].map(sizes)).toEqual([[1], [2], [3], [2, 2], [3, 2], [3, 3]]);
		expect(tileRows([])).toEqual([]);
	});
});

describe("the menu", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const surface = { rendered: [] as string[], render: vi.fn(async (el: HTMLElement, markdown: string) => { el.innerHTML = '<p>note <a href="x">link</a></p>'; surface.rendered.push(markdown); }), edit: vi.fn() };
	const open = (task: TaskItem) => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		TaskMenu.open({ item: task, source, today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions, markdown: surface });
		return actions;
	};
	const panel = () => document.querySelector(".tc-panel") as HTMLElement;
	const labels = (selector: string) => [...panel().querySelectorAll(selector)].map((node) => node.textContent);

	it("follows a link from the card's copy and closes", () => {
		const actions = open(item({ text: "Позвонить [[Люди/Петя|Пете]]" }));
		(document.querySelector(".tc-lifted .tc-link") as HTMLElement).click();
		expect(actions.openLink).toHaveBeenCalledWith({ kind: "note", target: "Люди/Петя" });
		expect(document.querySelector(".tc-backdrop")?.classList.contains("is-closing")).toBe(true);
	});

	it("leaves the menu open on a tap beside the link", () => {
		const actions = open(item({ text: "Позвонить [[Люди/Петя|Пете]]" }));
		(document.querySelector(".tc-lifted .tc-card-title") as HTMLElement).click();
		expect(actions.openLink).not.toHaveBeenCalled();
		expect(document.querySelector(".tc-backdrop")?.classList.contains("is-closing")).toBe(false);
	});

	it("shows the statuses, the levels, the edits and Delete, each in its own group", () => {
		open(item());
		expect(labels(".tc-menu-tiles.is-status .tc-menu-tile-label")).toEqual(["Done", "In progress", "Won’t do"]);
		expect(labels(".tc-menu-tiles.is-priority .tc-menu-tile-label")).toEqual(["p1", "p2"]);
		expect(labels(".tc-menu-label")).toEqual(["Rename", "Add description", "Due date", "Add subtask", "Delete"]);
		expect(panel().querySelector(".tc-menu-badge")).toBeNull();
	});

	it("marks the task's level with a badge, and a tap on it takes the priority off", () => {
		const actions = open(item({ priority: LEVELS[0] }));
		const tiles = panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile");
		expect(tiles[0].classList.contains("is-on")).toBe(true);
		expect(tiles[0].querySelector(".tc-menu-badge")).not.toBeNull();
		tiles[0].click();
		expect(actions.setPriority).toHaveBeenCalledWith(null);
	});

	it("sets the level tapped", () => {
		const actions = open(item());
		panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile")[1].click();
		expect(actions.setPriority).toHaveBeenCalledWith("p2");
	});

	it("marks the task done from its tile", () => {
		const actions = open(item());
		panel().querySelector<HTMLButtonElement>(".tc-menu-tiles.is-status .tc-menu-tile")?.click();
		expect(actions.setStatus).toHaveBeenCalledWith("done");
	});

	it("shows the start of the description over the copy, drawn by the surface, with the menu", () => {
		open(item({ description: "- note" }));
		const peek = document.querySelector(".tc-desc-peek");
		expect(peek?.querySelector(".tc-desc-text")?.textContent).toBe("note link");
		expect(surface.rendered[surface.rendered.length - 1]).toBe("- note");
		expect(document.querySelector(".tc-panel .tc-menu-label")?.textContent).toBe("Rename");
	});

	it("shows no start of a description for a task without one", () => {
		open(item());
		expect(document.querySelector(".tc-desc-peek")).toBeNull();
	});

	it("reads the whole description on a tap on its start, and leaves a tapped link to open by itself", () => {
		const actions = open(item({ description: "- note" }));
		(document.querySelector(".tc-desc-peek a") as HTMLElement).click();
		expect(actions.openDescription).not.toHaveBeenCalled();
		expect(document.querySelector(".tc-backdrop")?.classList.contains("is-closing")).toBe(true);
		document.body.innerHTML = "";
		const again = open(item({ description: "- note" }));
		(document.querySelector(".tc-desc-peek p") as HTMLElement).click();
		expect(again.openDescription).toHaveBeenCalledWith(false);
	});

	it("opens the description's editor from Add description", () => {
		const actions = open(item());
		const row = [...panel().querySelectorAll<HTMLElement>(".tc-menu-row")].find((r) => r.textContent === "Add description");
		row?.click();
		expect(actions.openDescription).toHaveBeenCalledWith(true);
	});

	it("leaves out the priority group when no level is set up", () => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", levels: [], actions });
		expect(panel().querySelector(".tc-menu-tiles.is-priority")).toBeNull();
	});
});

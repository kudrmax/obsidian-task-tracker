// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "../../src/application/contracts";
import { editRows, nextPriority, priorityTiles, statusTiles, TaskMenu, tileRows } from "../../src/ui/menu/TaskMenu";

const item = (extra: Partial<TaskItem> = {}): TaskItem => ({ key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, priority: null, subtasks: [], progress: null, parentText: null, group: null, ...extra });

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
		const rows = editRows(item({ dueDate: "2026-11-03" }));
		expect(rows.map((r) => r.id)).toEqual(["rename", "due", "subtask"]);
		expect(rows[1].value).toBe("3 Nov");
	});

	it("shows no date beside Due date without one", () => {
		expect(editRows(item())[1].value).toBe("");
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

	const open = (task: TaskItem) => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		TaskMenu.open({ item: task, source, today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions });
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
		expect(labels(".tc-menu-label")).toEqual(["Rename", "Due date", "Add subtask", "Delete"]);
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

	it("leaves out the priority group when no level is set up", () => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", levels: [], actions });
		expect(panel().querySelector(".tc-menu-tiles.is-priority")).toBeNull();
	});
});

describe("the calendar menu's stack for a new subtask", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const sub = (index: number, text: string): TaskItem => item({ key: { section: "now", index: 0, path: [index], raw: text }, text });

	const openOnBlock = (task: TaskItem) => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		source.className = "tc-block";
		const menu = TaskMenu.open({ item: task, source, today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions });
		return { menu, actions };
	};
	const panel = () => document.querySelector<HTMLElement>(".tc-panel.is-task")!;
	const stack = () => [...document.querySelectorAll<HTMLElement>(".tc-menu-subtasks > *")].map((row) => (row.classList.contains("tc-quick-row") ? "field" : row.textContent));

	it("keeps the menu open on Add subtask and hands it to the action", () => {
		const { menu, actions } = openOnBlock(item({ subtasks: [sub(0, "A1")] }));
		[...panel().querySelectorAll<HTMLElement>(".tc-menu-row")].find((row) => row.textContent?.includes("Add subtask"))!.click();
		expect(actions.addSubtask).toHaveBeenCalledWith(menu);
		expect(panel().isConnected).toBe(true);
		expect(menu.stacks).toBe(true);
	});

	it("hides the panel and puts the field's row last in the stack", () => {
		const { menu } = openOnBlock(item({ subtasks: [sub(0, "A1"), sub(1, "A2")] }));
		const row = menu.openStack(() => {});
		expect(panel().hidden).toBe(true);
		expect(stack()).toEqual(["A1", "A2", "field"]);
		expect(row.parentElement!.lastElementChild).toBe(row);
	});

	it("opens a stack under the copy for a task with no subtasks yet", () => {
		const { menu } = openOnBlock(item());
		menu.openStack(() => {});
		expect(stack()).toEqual(["field"]);
	});

	it("redraws the stack from the subtasks given and the texts not yet written, the field's row kept last", () => {
		const { menu } = openOnBlock(item({ subtasks: [sub(0, "A1")] }));
		const row = menu.openStack(() => {});
		const field = row.appendChild(document.createElement("textarea"));
		menu.showStack(item({ subtasks: [sub(0, "A1"), sub(1, "A2")] }), ["A3"]);
		expect(stack()).toEqual(["A1", "A2", "A3", "field"]);
		expect(row.contains(field)).toBe(true);
	});

	it("shows a link in a text not yet written by its word, as a card does", () => {
		const { menu } = openOnBlock(item());
		menu.openStack(() => {});
		menu.showStack(item(), ["Call [[People/Pete|Pete]]"]);
		expect(stack()).toEqual(["Call Pete", "field"]);
		expect(document.querySelector(".tc-menu-subtasks .tc-link")?.textContent).toBe("Pete");
	});

	it("keeps the copy's subtask counter up with the task as the screen shows it", () => {
		const source = document.body.appendChild(document.createElement("div"));
		source.className = "tc-block";
		source.innerHTML = '<div class="tc-block-card"><div class="tc-card-title">A</div><span class="tc-block-meta"></span></div>';
		const task = item();
		const menu = TaskMenu.open({ item: task, source, today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions: { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() } });
		menu.openStack(() => {});
		const count = () => [...document.querySelectorAll(".tc-lifted .tc-count")].map((c) => c.textContent);
		menu.showStack({ ...task, subtasks: [sub(0, "A1")], progress: { done: 0, total: 1 } }, []);
		expect(count()).toEqual(["0/1"]);
		expect(document.querySelector(".tc-lifted .tc-card-title")!.nextElementSibling!.className).toBe("tc-count");
		menu.showStack({ ...task, subtasks: [sub(0, "A1"), sub(1, "A2")], progress: { done: 0, total: 2 } }, []);
		expect(count()).toEqual(["0/2"]);
	});

	it("tells the stack's holder once that it closed", () => {
		const onClose = vi.fn();
		const { menu } = openOnBlock(item());
		menu.openStack(onClose);
		menu.close();
		menu.close();
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("a list card's menu is no stack: Add subtask closes it", () => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		const menu = TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions });
		expect(menu.stacks).toBe(false);
		[...panel().querySelectorAll<HTMLElement>(".tc-menu-row")].find((row) => row.textContent?.includes("Add subtask"))!.click();
		expect(actions.addSubtask).toHaveBeenCalledWith(menu);
		expect(panel().classList.contains("is-closing")).toBe(true);
	});
});

describe("the menu of a subtask from the calendar menu's stack", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const subtask = item({ key: { section: "now", index: 0, path: [1], raw: "- [ ] A2" }, text: "A2", status: "inProgress" });
	const openOnStackCard = () => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		const stack = document.body.appendChild(document.createElement("div"));
		stack.className = "tc-menu-subtasks";
		const source = stack.appendChild(document.createElement("div"));
		source.className = "tc-card";
		source.getBoundingClientRect = () => new DOMRect(200, 300, 150, 35);
		const menu = TaskMenu.open({ item: subtask, source, today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions });
		return { menu, actions };
	};
	const panel = () => document.querySelector<HTMLElement>(".tc-panel.is-task")!;

	it("offers no Add subtask", () => {
		const { menu } = openOnStackCard();
		expect(menu.inStack).toBe(true);
		expect([...panel().querySelectorAll(".tc-menu-label")].map((l) => l.textContent)).toEqual(["Rename", "Due date", "Delete"]);
	});

	it("stays open on Rename and hands itself to the action", () => {
		const { menu, actions } = openOnStackCard();
		[...panel().querySelectorAll<HTMLElement>(".tc-menu-row")].find((row) => row.textContent?.includes("Rename"))!.click();
		expect(actions.rename).toHaveBeenCalledWith(menu);
		expect(panel().classList.contains("is-closing")).toBe(false);
	});

	it("turns the card into a row for the field in its place: the panel and the copy go, the strip stays", () => {
		const { menu } = openOnStackCard();
		const row = menu.openRename(() => {});
		expect(panel().hidden).toBe(true);
		expect(document.querySelector<HTMLElement>(".tc-lifted")!.style.visibility).toBe("hidden");
		expect(row.classList.contains("tc-menu-field")).toBe(true);
		expect(row.classList.contains("tc-quick-row")).toBe(true);
		expect([row.style.left, row.style.top, row.style.width]).toEqual(["200px", "300px", "150px"]);
		expect(row.querySelector(".tc-strip")).not.toBeNull();
	});

	it("tells the field's holder how it closed", () => {
		const { menu } = openOnStackCard();
		const heard: string[] = [];
		menu.openRename((how) => heard.push(how));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(heard).toEqual(["escape"]);
	});
});

describe("the parts over the blur, raised over the keyboard", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("stand higher by the amount asked, never lower than the card, and the field's row with them", () => {
		const actions = { setStatus: vi.fn(async () => {}), setDueDate: vi.fn(async () => {}), setPriority: vi.fn(async () => {}), rename: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		source.className = "tc-block";
		source.getBoundingClientRect = () => new DOMRect(200, 500, 150, 35);
		const menu = TaskMenu.open({ item: item(), source, today: "2026-11-01", day: "2026-11-01", levels: LEVELS, actions });
		menu.openStack(() => {});
		const copy = document.querySelector<HTMLElement>(".tc-lifted")!;
		const stack = document.querySelector<HTMLElement>(".tc-menu-subtasks")!;
		const [copyTop, stackTop] = [parseFloat(copy.style.top), parseFloat(stack.style.top)];
		menu.raise(120);
		expect(menu.raised).toBe(120);
		expect([parseFloat(copy.style.top), parseFloat(stack.style.top)]).toEqual([copyTop - 120, stackTop - 120]);
		menu.raise(-40);
		expect(menu.raised).toBe(0);
		expect([parseFloat(copy.style.top), parseFloat(stack.style.top)]).toEqual([copyTop, stackTop]);
	});
});


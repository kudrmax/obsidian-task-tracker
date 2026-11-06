// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LabelLevel, MenuFrom, PriorityLevel, RepeatRule, SectionChoice, SectionOffer, TaskItem, TaskMenuModel } from "../../src/application/contracts";
import { taskMenu } from "../../src/application/menus";
import { tileRows } from "../../src/ui/menu/MenuPanel";
import { editRows, labelTiles, priorityTiles, statusTiles, TaskMenu } from "../../src/ui/menu/TaskMenu";
import { onDay } from "../fakes/itemOnDay";

const item = (extra: Partial<TaskItem> = {}): TaskItem => onDay({ key: { section: "now", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: extra.key?.section ?? "now", isSubtask: (extra.key?.path.length ?? 0) > 0, ...extra }, "2026-11-01");

/** The sections a choice names, offered in every list. */
const offerOf = (sections?: SectionChoice): SectionOffer | null => (sections ? { lists: { now: sections.names, soon: sections.names, inbox: sections.names, backlog: sections.names }, ungrouped: sections.ungrouped } : null);

/** The menu's model as the service reads it for the task on `today`, opened `from` a list card unless said, the sections given offered. */
const menuOf = (levels: readonly PriorityLevel[], labels: readonly LabelLevel[] = [], sections?: SectionChoice, today = "2026-11-01", from: MenuFrom = "day") => (task: TaskItem): TaskMenuModel => taskMenu([task], today, levels, labels, offerOf(sections), { kind: "task", from });

const weekly = (days: RepeatRule["days"]): RepeatRule => ({ kind: "schedule", every: 1, unit: "week", days, dayOfMonth: null, from: null });
const THURSDAY = "2026-11-05";
const EVERY_3_DAYS: RepeatRule = { kind: "schedule", every: 3, unit: "day", days: [], dayOfMonth: null, from: null };

const LEVELS = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
] as const;

describe("the status group", () => {
	it("draws the model's tiles in its order, named and drawn by what they set", () => {
		const tiles = statusTiles(menuOf([])(item()));
		expect(tiles.map((t) => [t.id, t.label, t.icon, t.confirm])).toEqual([["done", "Done", "done", false], ["inProgress", "In progress", "progress", false], ["wontDo", "Won’t do", "wontdo", true]]);
	});

	it("names the progress tile Stop progress when the model says it takes the task back to todo", () => {
		expect(statusTiles(menuOf([])(item({ status: "inProgress" })))[1].label).toBe("Stop progress");
	});

	it("draws Stop last where the model offers it", () => {
		const tiles = statusTiles(menuOf([])(item({ repeat: EVERY_3_DAYS, can: { ...item().can, stop: true } })));
		expect(tiles[tiles.length - 1]).toEqual({ id: "stop", label: "Stop", icon: "stop", confirm: true });
	});
});

describe("the edit group", () => {
	const sections: SectionChoice = { names: ["Morning", "Evening"], current: "Morning", ungrouped: "No section" };

	it("holds Rename, Repeat and Add subtask, with no due date row: the quick moves and their picker set it", () => {
		const rows = editRows(item({ dueDate: "2026-11-03", description: "- note" }), menuOf([])(item({ dueDate: "2026-11-03", description: "- note" })));
		expect(rows.map((r) => r.id)).toEqual(["rename", "repeat", "subtask"]);
	});

	it("offers Add description by what the task may have", () => {
		expect(editRows(item({ can: { ...item().can, addDescription: false } }), menuOf([])(item({ can: { ...item().can, addDescription: false } }))).map((r) => r.id)).not.toContain("description");
	});

	it("offers Add description after Rename for a task without one", () => {
		const rows = editRows(item(), menuOf([])(item()));
		expect(rows.map((r) => r.label)).toEqual(["Rename", "Add description", "Repeat", "Add subtask"]);
		expect(rows[1].icon).toBe("description");
	});

	it("offers Section before Add subtask for a list card, its section's name beside it", () => {
		const rows = editRows(item({ description: "- note", group: "Morning" }), menuOf([], [], sections)(item({ description: "- note", group: "Morning" })));
		expect(rows.map((r) => [r.label, r.value])).toEqual([["Rename", ""], ["Repeat", ""], ["Section", "Morning"], ["Add subtask", ""]]);
	});

	it("offers Repeat after Add description, or after Rename for a task with a description", () => {
		expect(editRows(item(), menuOf([])(item())).map((r) => r.id)).toEqual(["rename", "description", "repeat", "subtask"]);
		expect(editRows(item({ description: "- note" }), menuOf([], [], sections)(item({ description: "- note" }))).map((r) => r.id)).toEqual(["rename", "repeat", "section", "subtask"]);
		expect(editRows(item(), menuOf([])(item())).find((r) => r.id === "repeat")).toMatchObject({ label: "Repeat", value: "", icon: "repeat" });
	});

	it("offers no Repeat for a task the file says may not repeat", () => {
		expect(editRows(item({ repeatable: false }), menuOf([])(item({ repeatable: false }))).map((r) => r.id)).not.toContain("repeat");
	});

	it("shows the rule beside Repeat: a week's days as letters, any other rule in words", () => {
		const repeatRow = (rule: RepeatRule) => editRows(item({ repeat: rule }), menuOf([])(item({ repeat: rule }))).find((r) => r.id === "repeat")!;
		expect(repeatRow(weekly([0, 2, 4]))).toMatchObject({ value: "", days: [0, 2, 4] });
		expect(repeatRow(EVERY_3_DAYS)).toMatchObject({ value: "Every 3 days", days: null });
	});

	it("offers the reminder of a task on a time, its kind beside it, after Rename", () => {
		const slot = { date: "2026-11-03", start: 600, end: null };
		const rows = editRows(item({ description: "- note", slot, reminder: "alarm" }), menuOf([])(item({ description: "- note", slot, reminder: "alarm" })));
		expect(rows.map((r) => [r.id, r.value])).toEqual([["rename", ""], ["reminder", "Alarm"], ["repeat", ""], ["subtask", ""]]);
		expect(editRows(item({ description: "- note", slot, reminder: "none" }), menuOf([])(item({ description: "- note", slot, reminder: "none" })))[1].value).toBe("Off");
		expect(editRows(item({ description: "- note", slot, reminder: "live" }), menuOf([])(item({ description: "- note", slot, reminder: "live" })))[1].value).toBe("Live Activity");
		expect(editRows(item({ description: "- note", slot }), menuOf([])(item({ description: "- note", slot })))[1].value).toBe("Notification");
	});

	it("offers no reminder to a task without a time", () => {
		expect(editRows(item({ description: "- note" }), menuOf([])(item({ description: "- note" }))).map((r) => r.id)).not.toContain("reminder");
	});

	it("offers the reminder by what the task may have, not by its slot", () => {
		const slot = { date: "2026-11-03", start: 600, end: null };
		const can = { ...item().can, postpone: true, removeDue: false, setPriority: true, setLabels: true };
		expect(editRows(item({ description: "- note", slot, can: { ...can, remind: false } }), menuOf([])(item({ description: "- note", slot, can: { ...can, remind: false } }))).map((r) => r.id)).not.toContain("reminder");
		expect(editRows(item({ description: "- note", can: { ...can, remind: true } }), menuOf([])(item({ description: "- note", can: { ...can, remind: true } }))).map((r) => r.id)).toContain("reminder");
	});

	it("shows no name beside Section for a task outside any", () => {
		expect(editRows(item({ description: "- note" }), menuOf([], [], { ...sections, current: null })(item({ description: "- note" }))).find((r) => r.id === "section")!.value).toBe("");
	});
});

describe("the label group", () => {
	const LABELS = [{ name: "Важное", color: "red" }, { name: "Очень_срочное", color: "orange" }] as const;

	it("has a tile per label of the model, named with spaces, on as the model says", () => {
		expect(labelTiles(menuOf([], LABELS)(item({ labels: [LABELS[1]] })))).toEqual([
			{ name: "Важное", color: "red", title: "Важное", on: false },
			{ name: "Очень_срочное", color: "orange", title: "Очень срочное", on: true },
		]);
	});

	it("stays open after a tap on a label, drawn for the task as the file then has it, so the next tap reads that", async () => {
		const source = document.body.appendChild(document.createElement("div"));
		const written: string[] = [];
		const toggleLabel = vi.fn(async (name: string) => {
			written.push(name);
			const names = written;
			return item({ labels: LABELS.filter((l) => names.includes(l.name)), key: { section: "now", index: 0, path: [], raw: `- [ ] A ${names.join(" ")}` } });
		});
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel, setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const menu = TaskMenu.open({ item: item(), source, today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS, LABELS), actions });
		await new Promise((r) => setTimeout(r, 0));
		const tile = (i: number) => document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-labels .tc-menu-tile")[i];
		tile(0).click();
		await vi.waitFor(() => expect(tile(0)?.classList.contains("is-on")).toBe(true));
		tile(1).click();
		await vi.waitFor(() => expect(written).toEqual(["Важное", "Очень_срочное"]));
		await vi.waitFor(() => expect(document.querySelector(".tc-lifted")?.getAttribute("data-labels")).toBe("2"));
		expect([...document.querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile")].every((t) => t.disabled)).toBe(true);
		menu.close();
		document.body.innerHTML = "";
	});

	it("can't be pressed while the task has a priority, nor the levels while it has labels: as the task's `can` says", () => {
		const source = document.body.appendChild(document.createElement("div"));
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const disabled = (kind: string) => [...document.querySelectorAll<HTMLButtonElement>(`.tc-menu-tiles.${kind} .tc-menu-tile`)].map((t) => t.disabled);
		const labelled = TaskMenu.open({ item: item({ labels: [LABELS[0]] }), source, today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS, LABELS), actions });
		expect([disabled("is-priority"), disabled("is-labels")]).toEqual([[true, true], [false, false]]);
		labelled.close();
		document.body.innerHTML = "";
		const prioritized = TaskMenu.open({ item: item({ priority: LEVELS[0] }), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS, LABELS), actions });
		expect(disabled("is-labels")).toEqual([true, true]);
		prioritized.close();
		document.body.innerHTML = "";
		const can = { ...item().can, postpone: true, removeDue: false, remind: false, setPriority: false, setLabels: false };
		const barred = TaskMenu.open({ item: item({ can }), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS, LABELS), actions });
		expect([disabled("is-priority"), disabled("is-labels")]).toEqual([[true, true], [true, true]]);
		barred.close();
		document.body.innerHTML = "";
	});
});

describe("the priority group", () => {
	it("has a tile per level of the model, on as the model says", () => {
		expect(priorityTiles(menuOf(LEVELS)(item({ priority: LEVELS[1] })))).toEqual([
			{ prefix: "p1", color: "red", on: false },
			{ prefix: "p2", color: "orange", on: true },
		]);
		expect(priorityTiles(menuOf(LEVELS)(item())).some((t) => t.on)).toBe(false);
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
	const open = (task: TaskItem, sections?: SectionChoice, today = "2026-11-01", focused = false) => {
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), openFull: focused ? undefined : vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		TaskMenu.open({ item: task, source, today, day: today, menu: menuOf(LEVELS, [], sections, today), actions, markdown: surface });
		return actions;
	};
	const panel = () => document.querySelector(".tc-panel") as HTMLElement;
	const labels = (selector: string) => [...panel().querySelectorAll(selector)].map((node) => node.textContent);
	const row = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>(".tc-menu-row")].find((r) => r.querySelector(".tc-menu-label")?.textContent === label)!;
	const closing = () => document.querySelector(".tc-backdrop")?.classList.contains("is-closing");

	it("puts the task off from a quick move and closes", () => {
		const actions = open(item());
		panel().querySelector<HTMLButtonElement>(".tc-menu-tiles.is-move .tc-menu-tile")?.click();
		expect(actions.postpone).toHaveBeenCalledWith("2026-11-02");
		expect(closing()).toBe(true);
	});

	it("opens the month picker from Pick a date: a day puts the task off, Remove due date takes the date away", () => {
		const actions = open(item({ key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, dueDate: "2026-11-05" }));
		const tiles = panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-move .tc-menu-tile");
		tiles[tiles.length - 1].click();
		expect(panel().querySelector(".tc-picker-grid")).not.toBeNull();
		expect(closing()).toBe(false);
		row("Remove due date").click();
		expect(actions.removeDue).toHaveBeenCalled();
		expect(actions.postpone).not.toHaveBeenCalled();
	});

	it("offers Remove due date in the picker only when the item says its date may go", () => {
		open(item({ key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, dueDate: "2026-11-05", can: { ...item().can, postpone: true, removeDue: false, remind: false, setPriority: true, setLabels: true } }));
		const tiles = panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-move .tc-menu-tile");
		tiles[tiles.length - 1].click();
		expect(panel().querySelector(".tc-picker-grid")).not.toBeNull();
		expect(row("Remove due date")).toBeUndefined();
	});

	describe("Section", () => {
		const sections: SectionChoice = { names: ["Morning", "Evening", "Работа"], current: "Morning", ungrouped: "No section" };

		it("lists the sections, the task's own checked, then the tasks outside any, then New section", () => {
			open(item({ group: "Morning" }), sections);
			row("Section").click();
			expect(panel().querySelector(".tc-menu-back")?.textContent).toBe("Section");
			expect(labels(".tc-menu-group .tc-menu-label")).toEqual(["Morning", "Evening", "Работа", "No section"]);
			expect(row("Morning").querySelector("svg")).not.toBeNull();
			expect(row("Evening").querySelector("svg")).toBeNull();
			expect(row("No section").classList.contains("is-quiet")).toBe(true);
			expect(row("New section").classList.contains("is-apart")).toBe(true);
			expect(closing()).toBe(false);
		});

		it("moves the task to the section picked, and among the tasks outside any on No section", () => {
			const actions = open(item({ group: "Morning" }), sections);
			row("Section").click();
			row("Evening").click();
			expect(actions.toSection).toHaveBeenCalledWith("Evening");
			expect(closing()).toBe(true);
			document.body.innerHTML = "";
			const again = open(item({ group: "Morning" }), sections);
			row("Section").click();
			row("No section").click();
			expect(again.toSection).toHaveBeenCalledWith(null);
		});

		it("hands its own section to the service too, which leaves the task where it is", () => {
			const actions = open(item({ group: "Morning" }), sections);
			row("Section").click();
			row("Morning").click();
			expect(actions.toSection).toHaveBeenCalledWith("Morning");
			expect(closing()).toBe(true);
		});

		it("asks for a new section's name from New section", () => {
			const actions = open(item(), { ...sections, current: null });
			row("Section").click();
			expect(row("No section").querySelector("svg")).not.toBeNull();
			row("New section").click();
			expect(actions.newSection).toHaveBeenCalled();
		});

		it("goes back to the menu", () => {
			open(item(), sections);
			row("Section").click();
			panel().querySelector<HTMLButtonElement>(".tc-menu-back")?.click();
			expect(labels(".tc-menu-tiles.is-status .tc-menu-tile-label")).toEqual(["Done", "In progress", "Won’t do"]);
		});

		it("is not offered without sections to choose from", () => {
			open(item());
			expect(labels(".tc-menu-label")).not.toContain("Section");
		});
	});

	describe("a task that repeats", () => {
		const ask = () => panel().querySelector<HTMLElement>(".tc-menu-ask");
		const statusTile = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-status .tc-menu-tile")].find((t) => t.textContent === label)!;
		const confirmButton = () => ask()!.querySelector<HTMLButtonElement>(".tc-menu-ask-btn:last-child")!;

		it("lays its four status tiles in one row", () => {
			open(item({ repeat: EVERY_3_DAYS }));
			const rows = panel().querySelectorAll(".tc-menu-tiles.is-status .tc-menu-tile-row");
			expect(rows).toHaveLength(1);
			expect([...rows[0].querySelectorAll(".tc-menu-tile-label")].map((l) => l.textContent)).toEqual(["Done", "In progress", "Won’t do", "Stop"]);
			expect(panel().querySelector(".tc-menu-tiles.is-status")!.classList.contains("is-four")).toBe(true);
		});

		it("keeps three status tiles for a task without a repeat", () => {
			open(item());
			expect(panel().querySelector(".tc-menu-tiles.is-status")!.classList.contains("is-four")).toBe(false);
		});

		it("asks before Stop in place of the status tiles, and stops only on Stop", () => {
			const actions = open(item({ text: "Зал", repeat: EVERY_3_DAYS }));
			statusTile("Stop").click();
			expect(actions.pickStatus).not.toHaveBeenCalled();
			expect(closing()).toBe(false);
			expect(panel().firstElementChild).toBe(ask());
			expect(ask()!.querySelector(".tc-menu-ask-question")!.textContent).toBe("Stop “Зал”?");
			expect(ask()!.querySelector(".tc-menu-ask-btn:first-child")!.textContent).toBe("Cancel");
			expect(confirmButton().textContent).toBe("Stop");
			expect(confirmButton().classList.contains("is-danger")).toBe(false);
			expect(confirmButton().querySelector("svg")).not.toBeNull();
			confirmButton().click();
			expect(actions.pickStatus).toHaveBeenCalledTimes(1);
			expect(actions.pickStatus).toHaveBeenCalledWith("stop");
			expect(closing()).toBe(true);
		});

		it("stops on Enter while Stop asks", () => {
			const actions = open(item({ repeat: EVERY_3_DAYS }));
			statusTile("Stop").click();
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			expect(actions.pickStatus).toHaveBeenCalledWith("stop");
		});

		it("shows a week's days beside Repeat, the chosen ones on", () => {
			open(item({ repeat: weekly([0, 2, 4]) }));
			const week = row("Repeat").querySelector(".tc-menu-week")!;
			const letters = [...week.querySelectorAll(".tc-menu-weekday")];
			expect(letters.map((l) => l.textContent)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
			expect(letters.map((l) => l.classList.contains("is-on"))).toEqual([true, false, true, false, true, false, false]);
			expect(week.getAttribute("aria-label")).toBe("Mon, Wed, Fri");
			expect(row("Repeat").querySelector(".tc-menu-value")).toBeNull();
		});

		it("shows any other rule beside Repeat in words, and nothing for a task without one", () => {
			open(item({ repeat: EVERY_3_DAYS }));
			expect(row("Repeat").querySelector(".tc-menu-value")!.textContent).toBe("Every 3 days");
			document.body.innerHTML = "";
			open(item());
			expect(row("Repeat").querySelector(".tc-menu-value, .tc-menu-week")).toBeNull();
		});

		const away = () => document.querySelector(".tc-backdrop")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

		it("opens the repeat panel in place of the menu: a change shows at once and the menu stays, the file untouched", () => {
			const actions = open(item({ repeat: weekly([0]) }));
			row("Repeat").click();
			expect(panel().classList.contains("is-repeat")).toBe(true);
			expect(panel().querySelector(".tc-menu-tiles")).toBeNull();
			expect(panel().querySelector(".tc-menu-back")).toBeNull();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[2].click();
			expect(panel().querySelectorAll(".tc-repeat-day")[2].getAttribute("aria-pressed")).toBe("true");
			expect(actions.setRepeat).not.toHaveBeenCalled();
			expect(closing()).toBe(false);
			expect(panel().classList.contains("is-repeat")).toBe(true);
		});

		it("writes the rule once, as it stands, when the menu closes", () => {
			const actions = open(item({ repeat: weekly([0]) }));
			row("Repeat").click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[2].click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[4].click();
			panel().querySelector<HTMLButtonElement>(".tc-repeat-step:last-child")!.click();
			away();
			expect(closing()).toBe(true);
			expect(actions.setRepeat).toHaveBeenCalledTimes(1);
			expect(actions.setRepeat).toHaveBeenCalledWith({ ...weekly([0, 2, 4]), every: 2 });
		});

		it("writes nothing on close when the rule came back to the one the task has", () => {
			const actions = open(item({ repeat: { ...weekly([0]), from: "2026-10-26" } }));
			row("Repeat").click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[2].click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[2].click();
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
			expect(closing()).toBe(true);
			expect(actions.setRepeat).not.toHaveBeenCalled();
		});

		it("takes the task's weekdays in any order as the same rule", () => {
			const actions = open(item({ repeat: weekly([4, 0]) }));
			row("Repeat").click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[2].click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")[2].click();
			away();
			expect(actions.setRepeat).not.toHaveBeenCalled();
		});

		it("takes the repeat off from Remove repeat and closes, as Remove due date does: one write", () => {
			const actions = open(item({ repeat: EVERY_3_DAYS }));
			row("Repeat").click();
			panel().querySelector<HTMLButtonElement>(".tc-repeat-step:last-child")!.click();
			row("Remove repeat").click();
			expect(closing()).toBe(true);
			expect(actions.setRepeat.mock.calls).toEqual([[null]]);
		});

		it("offers no Remove repeat for a task without a repeat, nor after a change: the change is the page's own until it closes", () => {
			const actions = open(item());
			row("Repeat").click();
			expect(row("Remove repeat")).toBeUndefined();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-seg-btn")[1].click();
			expect(row("Remove repeat")).toBeUndefined();
			expect(actions.setRepeat).not.toHaveBeenCalled();
			expect(closing()).toBe(false);
		});

		it("writes an Inbox task's weekdays once, as the page leaves them, when the menu closes", () => {
			const actions = open(item({ key: { section: "inbox", index: 0, path: [], raw: "- [ ] A" }, repeatDay: THURSDAY }), undefined, THURSDAY);
			row("Repeat").click();
			const day = (name: string) => [...panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-day")].find((b) => b.textContent === name)!;
			day("Mon").click();
			day("Thu").click();
			expect(actions.setRepeat).not.toHaveBeenCalled();
			away();
			expect(actions.setRepeat.mock.calls).toEqual([[weekly([0])]]);
		});

		it("writes a first rule once, when the menu closes", () => {
			const actions = open(item());
			row("Repeat").click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-seg-btn")[1].click();
			away();
			expect(actions.setRepeat).toHaveBeenCalledTimes(1);
			expect(actions.setRepeat).toHaveBeenCalledWith({ kind: "afterDone", every: 1, unit: "week", days: [], dayOfMonth: null, from: null });
		});

		it("starts a new rule from the day the service gives: the weekday and the month's day are that day's", () => {
			const actions = open(item({ dueDate: null, repeatDay: "2026-11-04" }));
			row("Repeat").click();
			panel().querySelectorAll<HTMLButtonElement>(".tc-repeat-seg-btn")[0].click();
			panel().querySelector<HTMLButtonElement>(".tc-repeat-step:last-child")!.click();
			away();
			expect(actions.setRepeat).toHaveBeenCalledWith({ ...weekly([2]), every: 2 });
		});
	});

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
		expect(labels(".tc-menu-tiles.is-move .tc-menu-tile-label")).toEqual(["Tomorrow", "Pick a date"]);
		expect(labels(".tc-menu-label")).toEqual(["Rename", "Add description", "Repeat", "Add subtask", "Open full screen", "Open in Obsidian", "Delete"]);
		expect(panel().querySelector(".tc-menu-badge")).toBeNull();
	});

	it("draws Delete only where the model offers it", () => {
		const actions = open(item());
		document.body.replaceChildren();
		TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: (task) => ({ ...menuOf(LEVELS)(task), remove: null }), actions });
		expect(labels(".tc-menu-label")).not.toContain("Delete");
	});

	it("opens the task on the whole screen and in Obsidian from a group of their own, and closes", () => {
		const actions = open(item());
		const rows = [...panel().querySelectorAll<HTMLButtonElement>(".tc-menu-row")];
		const full = rows.find((r) => r.textContent === "Open full screen")!;
		const obsidian = rows.find((r) => r.textContent === "Open in Obsidian")!;
		expect(full.parentElement).toBe(obsidian.parentElement);
		expect(full.nextElementSibling).toBe(obsidian);
		const rename = rows.find((r) => r.textContent === "Rename")!;
		expect([full.className, obsidian.className]).toEqual([rename.className, rename.className]);
		obsidian.click();
		expect(actions.openInObsidian).toHaveBeenCalled();
		expect(document.querySelector(".tc-backdrop")?.classList.contains("is-closing")).toBe(true);
	});

	it("Open full screen opens the task there; the task already there has no such row", () => {
		const actions = open(item());
		row("Open full screen").click();
		expect(actions.openFull).toHaveBeenCalled();
		document.body.innerHTML = "";
		open(item(), undefined, "2026-11-01", true);
		expect(labels(".tc-menu-row .tc-menu-label")).not.toContain("Open full screen");
		expect(labels(".tc-menu-row .tc-menu-label")).toContain("Open in Obsidian");
	});

	it("marks the task's level with a badge, and a tap on it takes the priority off", () => {
		const actions = open(item({ priority: LEVELS[0] }));
		const tiles = panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile");
		expect(tiles[0].classList.contains("is-on")).toBe(true);
		expect(tiles[0].querySelector(".tc-menu-badge")).not.toBeNull();
		tiles[0].click();
		expect(actions.togglePriority).toHaveBeenCalledWith("p1");
	});

	it("sets the level tapped", () => {
		const actions = open(item());
		panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-priority .tc-menu-tile")[1].click();
		expect(actions.togglePriority).toHaveBeenCalledWith("p2");
	});

	describe("Reminder", () => {
		const onTime = (reminder: TaskItem["reminder"]) => item({ slot: { date: "2026-11-01", start: 600, end: null }, reminder });

		it("lists the kinds in place of the menu, the task's own checked, Off last and quiet", () => {
			open(onTime("alarm"));
			row("Reminder").click();
			expect(panel().querySelector(".tc-menu-back")?.textContent).toBe("Reminder");
			expect(labels(".tc-menu-group .tc-menu-label")).toEqual(["Live Activity", "Notification", "Alarm", "Off"]);
			expect(row("Alarm").querySelector("svg")).not.toBeNull();
			expect(row("Live Activity").querySelector("svg")).toBeNull();
			expect(row("Off").classList.contains("is-quiet")).toBe(true);
			expect(closing()).toBe(false);
		});

		it("sets the kind picked and closes", () => {
			const actions = open(onTime("alarm"));
			row("Reminder").click();
			row("Off").click();
			expect(actions.setReminder).toHaveBeenCalledWith("none");
			expect(closing()).toBe(true);
		});

		it("goes back to the menu without a change", () => {
			const actions = open(onTime("live"));
			row("Reminder").click();
			panel().querySelector<HTMLButtonElement>(".tc-menu-back")!.click();
			expect(row("Rename")).toBeDefined();
			expect(actions.setReminder).not.toHaveBeenCalled();
			expect(closing()).toBe(false);
		});
	});

	it("starts and stops the progress from its tile", () => {
		const tile = () => panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-status .tc-menu-tile")[1];
		const start = open(item());
		tile().click();
		expect(start.pickStatus).toHaveBeenCalledWith("inProgress");
		document.body.innerHTML = "";
		const stop = open(item({ status: "inProgress" }));
		tile().click();
		expect(stop.pickStatus).toHaveBeenCalledWith("stopProgress");
	});

	it("marks the task done from its tile", () => {
		const actions = open(item());
		panel().querySelector<HTMLButtonElement>(".tc-menu-tiles.is-status .tc-menu-tile")?.click();
		expect(actions.pickStatus).toHaveBeenCalledWith("done");
	});

	describe("asking before Delete and Won’t do", () => {
		const ask = () => panel().querySelector<HTMLElement>(".tc-menu-ask");
		const askButton = (cls: string) => ask()!.querySelector<HTMLButtonElement>(cls)!;
		const wontDo = () => panel().querySelectorAll<HTMLButtonElement>(".tc-menu-tiles.is-status .tc-menu-tile")[2];

		it("turns the Delete row into the question, the task named, and deletes only on Delete", () => {
			const actions = open(item({ text: "Call the doctor" }));
			row("Delete").click();
			expect(actions.remove).not.toHaveBeenCalled();
			expect(closing()).toBe(false);
			expect(row("Delete")).toBeUndefined();
			expect(askButton(".tc-menu-ask-btn:last-child").classList.contains("is-danger")).toBe(true);
			expect(ask()!.querySelector(".tc-menu-ask-question")!.textContent).toBe("Delete “Call the doctor”?");
			expect(askButton(".tc-menu-ask-btn:last-child").textContent).toBe("Delete");
			askButton(".tc-menu-ask-btn:last-child").click();
			expect(actions.remove).toHaveBeenCalled();
			expect(closing()).toBe(true);
		});

		it("names the task in the question by the title the service gives", () => {
			open(item({ text: "Call [[People/Doctor|the doctor]]", title: "Call the doctor" }));
			row("Delete").click();
			expect(ask()!.querySelector(".tc-menu-ask-question")!.textContent).toBe("Delete “Call the doctor”?");
		});

		it("turns the status tiles into the question for Won’t do, and marks it only on Won’t do", () => {
			const actions = open(item({ text: "Call the doctor" }));
			wontDo().click();
			expect(actions.pickStatus).not.toHaveBeenCalled();
			expect(panel().querySelector(".tc-menu-tiles.is-status")).toBeNull();
			expect(askButton(".tc-menu-ask-btn:last-child").classList.contains("is-danger")).toBe(false);
			expect(ask()!.querySelector(".tc-menu-ask-question")!.textContent).toBe("Won’t do “Call the doctor”?");
			expect(panel().firstElementChild).toBe(ask());
			askButton(".tc-menu-ask-btn:last-child").click();
			expect(actions.pickStatus).toHaveBeenCalledWith("wontDo");
			expect(closing()).toBe(true);
		});

		it("gives the menu back as it was on Cancel", () => {
			const actions = open(item());
			row("Delete").click();
			askButton(".tc-menu-ask-btn:first-child").click();
			expect(ask()).toBeNull();
			expect(row("Delete")).toBeDefined();
			expect(labels(".tc-menu-tiles.is-status .tc-menu-tile-label")).toEqual(["Done", "In progress", "Won’t do"]);
			expect(actions.remove).not.toHaveBeenCalled();
			expect(closing()).toBe(false);
		});

		it("asks one thing at a time: Won’t do while Delete asks gives the Delete row back", () => {
			open(item());
			row("Delete").click();
			wontDo().click();
			expect(panel().querySelectorAll(".tc-menu-ask")).toHaveLength(1);
			expect(row("Delete")).toBeDefined();
		});

		it("confirms on Enter, as the button does", () => {
			const actions = open(item());
			row("Delete").click();
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			expect(actions.remove).toHaveBeenCalled();
		});

		it("leaves Enter alone while nothing asks", () => {
			const actions = open(item());
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			expect(actions.remove).not.toHaveBeenCalled();
			expect(actions.pickStatus).not.toHaveBeenCalled();
		});
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

	it("takes a second click right after the opening one as a double click, even on the panel: no tile is picked, the menu goes and renames", () => {
		vi.useFakeTimers();
		const actions = open(item());
		const menu = TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS), actions });
		const rename = vi.fn();
		menu.onClickedAgain(rename);
		vi.advanceTimersByTime(100);
		const tile = [...document.querySelectorAll<HTMLElement>(".tc-panel .tc-menu-tile")].pop()!;
		tile.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		tile.click();
		expect(rename).toHaveBeenCalled();
		expect(actions.postpone).not.toHaveBeenCalled();
		expect([...document.querySelectorAll(".tc-backdrop")].pop()?.classList.contains("is-closing")).toBe(true);
		vi.useRealTimers();
	});

	it("leaves a later click on the copy to the copy, the menu open", () => {
		vi.useFakeTimers();
		const menu = TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS), actions: open(item()) });
		const rename = vi.fn();
		menu.onClickedAgain(rename);
		vi.advanceTimersByTime(300);
		const copies = document.querySelectorAll(".tc-lifted");
		copies[copies.length - 1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		expect(rename).not.toHaveBeenCalled();
		expect([...document.querySelectorAll(".tc-backdrop")].pop()?.classList.contains("is-closing")).toBe(false);
		vi.useRealTimers();
	});

	it("leaves out the priority group when no level is set up", () => {
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: menuOf([]), actions });
		expect(panel().querySelector(".tc-menu-tiles.is-priority")).toBeNull();
	});
});

describe("the calendar menu's stack for a new subtask", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const sub = (index: number, text: string): TaskItem => item({ key: { section: "now", index: 0, path: [index], raw: text }, text });

	const surface = { render: vi.fn(async (el: HTMLElement) => void (el.textContent = "note")), edit: vi.fn() };
	const openOnBlock = (task: TaskItem) => {
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		source.className = "tc-block";
		const menu = TaskMenu.open({ item: task, source, today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS), actions, markdown: surface });
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

	it("takes the start of the description away with the panel while a subtask is typed", () => {
		const { menu } = openOnBlock(item({ description: "- note" }));
		const peek = document.querySelector<HTMLElement>(".tc-desc-peek")!;
		expect(peek.hidden).toBe(false);
		menu.openStack(() => {});
		expect(peek.hidden).toBe(true);
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
		const menu = TaskMenu.open({ item: task, source, today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS), actions: { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() } });
		menu.openStack(() => {});
		const count = () => [...document.querySelectorAll(".tc-lifted .tc-count")].map((c) => c.textContent);
		menu.showStack({ ...task, subtasks: [sub(0, "A1")], progress: { done: 0, total: 1 } }, []);
		expect(count()).toEqual(["0/1"]);
		expect(document.querySelector(".tc-lifted .tc-card-title")!.nextElementSibling!.className).toBe("tc-meta");
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
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const menu = TaskMenu.open({ item: item(), source: document.body.appendChild(document.createElement("div")), today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS), actions });
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

	const subtask = item({ key: { section: "now", index: 0, path: [1], raw: "- [ ] A2" }, text: "A2", status: "inProgress", parentText: "A", repeatable: false });
	const openOnStackCard = (description: string | null = null) => {
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const stack = document.body.appendChild(document.createElement("div"));
		stack.className = "tc-menu-subtasks";
		const source = stack.appendChild(document.createElement("div"));
		source.className = "tc-card";
		source.getBoundingClientRect = () => new DOMRect(200, 300, 150, 35);
		const surface = { render: vi.fn(async () => {}), edit: vi.fn() };
		const menu = TaskMenu.open({ item: { ...subtask, description }, source, today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS, [], undefined, "2026-11-01", "stack"), actions, markdown: surface });
		return { menu, actions };
	};
	const panel = () => document.querySelector<HTMLElement>(".tc-panel.is-task")!;

	it("takes the start of the description away with the panel while the subtask is renamed", () => {
		const { menu } = openOnStackCard("- note");
		const peek = document.querySelector<HTMLElement>(".tc-desc-peek")!;
		menu.openRename(() => {});
		expect(peek.hidden).toBe(true);
	});

	it("draws no Add subtask, which the model offers no subtask of a stack", () => {
		const { menu } = openOnStackCard();
		expect(menu.inStack).toBe(true);
		expect([...panel().querySelectorAll(".tc-menu-label")].map((l) => l.textContent)).toEqual(["Rename", "Add description", "Open in Obsidian", "Delete"]);
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
		expect(document.querySelector(".tc-lifted")!.classList.contains("tc-invisible")).toBe(true);
		expect(row.classList.contains("tc-menu-field")).toBe(true);
		expect(row.classList.contains("tc-quick-row")).toBe(true);
		expect([row.style.left, row.style.top, row.style.width]).toEqual(["200px", "300px", "150px"]);
		expect(row.querySelector(".tc-progress-dot")).not.toBeNull();
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
		const actions = { setRepeat: vi.fn(async () => {}), pickStatus: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), newSection: vi.fn(), togglePriority: vi.fn(async () => {}), toggleLabel: vi.fn(async () => null), setReminder: vi.fn(async () => {}), rename: vi.fn(), openDescription: vi.fn(), addSubtask: vi.fn(), remove: vi.fn(async () => {}), openInObsidian: vi.fn(), openLink: vi.fn() };
		const source = document.body.appendChild(document.createElement("div"));
		source.className = "tc-block";
		source.getBoundingClientRect = () => new DOMRect(200, 500, 150, 35);
		const menu = TaskMenu.open({ item: item(), source, today: "2026-11-01", day: "2026-11-01", menu: menuOf(LEVELS), actions });
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


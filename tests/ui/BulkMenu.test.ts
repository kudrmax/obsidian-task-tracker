// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem, TaskMenuModel } from "../../core/application/contracts";
import { taskMenu } from "../../core/application/menus";
import { BulkMenu, type BulkActions } from "../../obsidian/ui/menu/BulkMenu";
import { onDay } from "../fakes/itemOnDay";

const item = (index: number, marks: Partial<Pick<TaskItem, "priority" | "labels">> = {}): TaskItem => onDay({
	key: { section: "now", index, path: [], raw: `- [ ] T${index}` },
	text: `T${index}`,
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
	priority: null,
	group: null,
	subtasks: [],
	progress: null,
	parentText: null,
	description: null,
	list: "now",
	isSubtask: false,
	...marks,
}, "2026-11-04");

describe("BulkMenu (block 3)", () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	it("measures every picked card before it lifts any", () => {
		vi.useFakeTimers();
		const lifted: number[] = [];
		const cards = Array.from({ length: 5 }, (_, i) => {
			const card = document.body.appendChild(document.createElement("div"));
			card.getBoundingClientRect = () => {
				lifted.push(document.querySelectorAll(".tc-lifted").length);
				return new DOMRect(10, 100 + i * 40, 175, 35);
			};
			return card;
		});
		const done = async () => undefined;
		const actions: BulkActions = { pickStatus: done, togglePriority: done, postpone: done, removeDue: done, toSection: done, remove: done, toggleLabel: async () => null };
		BulkMenu.open({ items: cards.map((_, i) => item(i)), cards, source: cards[0], at: "beside", today: "2026-11-04", day: "2026-11-04", menu: (items) => taskMenu(items, "2026-11-04", [], [], null, { kind: "bulk" }), actions, onClose: () => {} });
		expect(lifted.length).toBeGreaterThanOrEqual(5);
		expect(lifted.every((count) => count === 0)).toBe(true);
		expect(document.querySelectorAll(".tc-lifted").length).toBe(5);
	});
});

describe("the bulk menu draws its model", () => {
	const RED = { name: "Важное", color: "red" } as const;
	const BLUE = { name: "Срочное", color: "blue" } as const;
	const P1 = { prefix: "p1", color: "red" } as const;
	afterEach(() => document.body.replaceChildren());

	const open = (model: Partial<TaskMenuModel>, items = [item(0), item(1)]) => {
		const cards = items.map(() => document.body.appendChild(document.createElement("div")));
		const actions = { pickStatus: vi.fn(async () => {}), togglePriority: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), remove: vi.fn(async () => {}), toggleLabel: vi.fn(async () => items) };
		const base = taskMenu(items, "2026-11-04", [P1], [RED, BLUE], null, { kind: "bulk" });
		BulkMenu.open({ items, cards, source: cards[0], at: "beside", today: "2026-11-04", day: "2026-11-04", menu: () => ({ ...base, ...model }), actions, onClose: () => {} });
		return actions;
	};
	const tiles = (kind: string) => [...document.querySelectorAll<HTMLButtonElement>(`.tc-menu-tiles.${kind} .tc-menu-tile`)];

	it("lights the tiles the model has on and dims the groups it can't press", () => {
		open({ levels: { tiles: [{ level: P1, on: true }], disabled: false }, labels: { tiles: [{ label: RED, on: false }, { label: BLUE, on: true }], disabled: true } });
		expect(tiles("is-priority").map((t) => [t.classList.contains("is-on"), t.disabled])).toEqual([[true, false]]);
		expect(tiles("is-labels").map((t) => [t.classList.contains("is-on"), t.disabled])).toEqual([[false, true], [true, true]]);
	});

	it("names the progress tile for what the model says it sets, and hands that tile to the service", async () => {
		const actions = open({ statuses: [{ id: "done", confirm: false }, { id: "stopProgress", confirm: false }, { id: "wontDo", confirm: false }] });
		const progress = tiles("is-status")[1];
		expect(progress.textContent).toContain("Stop progress");
		progress.click();
		await Promise.resolve();
		expect(actions.pickStatus).toHaveBeenCalledWith("stopProgress");
	});

	it("gives tasks up and deletes them at once, as the model says neither asks", async () => {
		const actions = open({});
		tiles("is-status")[2].click();
		await Promise.resolve();
		expect(actions.pickStatus).toHaveBeenCalledWith("wontDo");
		document.body.replaceChildren();
		const again = open({});
		[...document.querySelectorAll<HTMLButtonElement>(".tc-menu-row")].find((row) => row.textContent?.includes("Delete 2 tasks"))!.click();
		await Promise.resolve();
		expect(again.remove).toHaveBeenCalled();
	});

	it("asks first where the model says so, the picked tasks named", async () => {
		const actions = open({ statuses: [{ id: "done", confirm: false }, { id: "inProgress", confirm: false }, { id: "wontDo", confirm: true }], remove: { confirm: true } });
		tiles("is-status")[2].click();
		expect(actions.pickStatus).not.toHaveBeenCalled();
		expect(document.querySelector(".tc-menu-ask-question")?.textContent).toBe("Won’t do “2 tasks”?");
		document.querySelector<HTMLButtonElement>(".tc-menu-ask-btn:last-child")!.click();
		await Promise.resolve();
		expect(actions.pickStatus).toHaveBeenCalledWith("wontDo");
	});

	it("draws Delete only where the model offers it", () => {
		open({ remove: null });
		expect(document.body.textContent).not.toContain("Delete");
	});

	it("draws no moves group when no picked task may be put off", () => {
		open({ moves: [] });
		expect(document.querySelector(".tc-menu-tiles.is-move")).toBeNull();
	});

	it("offers Section where the model's edits have it", () => {
		open({});
		expect(document.body.textContent).not.toContain("Section");
		document.body.replaceChildren();
		const choice = { names: ["Work"], current: "Work", ungrouped: "No section" };
		open({ edits: ["section"], sections: { choice, options: [{ name: "Work", checked: true }, { name: null, checked: false }], create: false } });
		[...document.querySelectorAll<HTMLButtonElement>(".tc-menu-row")].find((row) => row.textContent?.includes("Section"))!.click();
		expect([...document.querySelectorAll(".tc-menu-group .tc-menu-label")].map((l) => l.textContent)).toEqual(["Work", "No section"]);
		expect(document.body.textContent).not.toContain("New section");
	});

	it("hands a tapped level and label to the service's toggles", async () => {
		const actions = open({});
		tiles("is-labels")[1].click();
		await vi.waitFor(() => expect(actions.toggleLabel).toHaveBeenCalledWith("Срочное"));
		tiles("is-priority")[0].click();
		expect(actions.togglePriority).toHaveBeenCalledWith("p1");
	});
});

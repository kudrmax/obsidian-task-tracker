// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskItem, TaskMenuModel } from "../../src/application/contracts";
import { taskMenu } from "../../src/application/menus";
import { BulkMenu, type BulkActions } from "../../src/ui/menu/BulkMenu";
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
		const actions: BulkActions = { setStatus: done, togglePriority: done, postpone: done, removeDue: done, toSection: done, remove: done, toggleLabel: async () => null };
		BulkMenu.open({ items: cards.map((_, i) => item(i)), cards, source: cards[0], at: "beside", today: "2026-11-04", day: "2026-11-04", menu: (items) => taskMenu(items, "2026-11-04", [], [], null), actions, onClose: () => {} });
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
		const actions = { setStatus: vi.fn(async () => {}), togglePriority: vi.fn(async () => {}), postpone: vi.fn(async () => {}), removeDue: vi.fn(async () => {}), toSection: vi.fn(async () => {}), remove: vi.fn(async () => {}), toggleLabel: vi.fn(async () => items) };
		const base = taskMenu(items, "2026-11-04", [P1], [RED, BLUE], null);
		BulkMenu.open({ items, cards, source: cards[0], at: "beside", today: "2026-11-04", day: "2026-11-04", menu: () => ({ ...base, ...model }), actions, onClose: () => {} });
		return actions;
	};
	const tiles = (kind: string) => [...document.querySelectorAll<HTMLButtonElement>(`.tc-menu-tiles.${kind} .tc-menu-tile`)];

	it("lights the tiles the model has on and dims the groups it can't press", () => {
		open({ levels: { tiles: [{ level: P1, on: true }], disabled: false }, labels: { tiles: [{ label: RED, on: false }, { label: BLUE, on: true }], disabled: true } });
		expect(tiles("is-priority").map((t) => [t.classList.contains("is-on"), t.disabled])).toEqual([[true, false]]);
		expect(tiles("is-labels").map((t) => [t.classList.contains("is-on"), t.disabled])).toEqual([[false, true], [true, true]]);
	});

	it("names the progress tile for what the model says it sets, and sets that", async () => {
		const actions = open({ progress: "todo" });
		const progress = tiles("is-status")[1];
		expect(progress.textContent).toContain("Stop progress");
		progress.click();
		await Promise.resolve();
		expect(actions.setStatus).toHaveBeenCalledWith("todo");
	});

	it("hands a tapped level and label to the service's toggles", async () => {
		const actions = open({});
		tiles("is-labels")[1].click();
		await vi.waitFor(() => expect(actions.toggleLabel).toHaveBeenCalledWith("Срочное"));
		tiles("is-priority")[0].click();
		expect(actions.togglePriority).toHaveBeenCalledWith("p1");
	});
});

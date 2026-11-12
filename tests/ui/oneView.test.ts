// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { allColumnsDividerAt, allColumnsShare, allColumnsWidthAt, allColumnsWidths } from "../../obsidian/ui/listWidth";
import { CarryReport } from "../../obsidian/ui/projects/CarryReport";
import { TaskList } from "../../obsidian/ui/TaskList";
import { FunnelRows } from "../../obsidian/ui/FunnelRows";
import { PROJECTS_HOVER_MS } from "../../core/application/contracts";

describe("All columns (board D1): three lists and the timeline beside the divider", () => {
	it("stands four equal columns at the middle share, as the board draws them", () => {
		const { width } = allColumnsWidths(0.5, 804);
		expect(width).toBe(189);
		expect(allColumnsDividerAt(width)).toBe(3 * 189 + 32);
	});

	it("turns the divider's place back into the lists' width and the share it saves", () => {
		expect(allColumnsWidthAt(allColumnsDividerAt(200))).toBe(200);
		const share = allColumnsShare(189, 804);
		expect(share).toBeCloseTo(0.5);
		expect(allColumnsWidths(share, 804).width).toBeCloseTo(189);
	});

	it("keeps the timeline at least a list's least width", () => {
		const { width, max } = allColumnsWidths(0.95, 804);
		expect(width).toBe(max);
		expect(804 - 48 - 3 * max).toBeGreaterThanOrEqual(110);
	});
});

describe("a carrying finger told to the core's carry (spec decision 39)", () => {
	afterEach(() => vi.useRealTimers());

	it("tells the core where the finger is only when that changes, and again once the core's wait is up", async () => {
		vi.useFakeTimers();
		const root = document.createElement("div");
		const told: { edge: boolean; node: string | null }[] = [];
		let changed = 0;
		const report = new CarryReport({
			tasks: { carryAt: async (at) => (told.push(at), { wait: told.length === 1 ? PROJECTS_HOVER_MS : null }) },
			root: () => root,
			tree: () => null,
			now: () => 0,
			changed: async () => void changed++,
			onError: (e) => {
				throw e;
			},
		});
		report.move(5, 100);
		report.move(6, 120);
		await vi.advanceTimersByTimeAsync(0);
		expect(told).toEqual([{ edge: true, node: null }]);
		await vi.advanceTimersByTimeAsync(PROJECTS_HOVER_MS);
		expect(told).toHaveLength(2);
		report.move(200, 100);
		await vi.advanceTimersByTimeAsync(0);
		expect(told[2]).toEqual({ edge: false, node: null });
		expect(changed).toBe(3);
		report.end();
	});
});

describe("an empty list's plate (spec decision 18)", () => {
	it("draws «No tasks» where a list draws nothing and its owner asks for it, a tap typing at the end", () => {
		let words: string | null = "No tasks";
		let typed = 0;
		const list = new TaskList(document.createElement("div"), { items: () => [], day: () => null, empty: () => words, onEmpty: () => typed++ });
		list.render(false);
		const plate = list.el.querySelector<HTMLElement>(".tc-list-empty");
		expect(plate?.textContent).toBe("No tasks");
		plate!.click();
		expect(typed).toBe(1);
		expect(list.elements).toEqual([]);
		words = null;
		list.render(false);
		expect(list.el.querySelector(".tc-list-empty")).toBeNull();
	});
});

describe("the rows (board D2)", () => {
	it("stacks the stages in the core's order under their labels, none but those", () => {
		const rows = new FunnelRows(document.createElement("div"), ["inbox", "backlog", "soon", "day"], (column) => (column === "day" ? "Today" : column));
		rows.render(["soon", "inbox"]);
		const shown = [...rows.el.querySelectorAll<HTMLElement>(".tc-row:not(.tc-hidden)")].map((row) => row.querySelector(".tc-row-label")!.textContent);
		expect(shown).toEqual(["soon", "inbox"]);
	});
});

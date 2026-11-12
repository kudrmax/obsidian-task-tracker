// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { allColumnsDividerAt, allColumnsShare, allColumnsWidthAt, allColumnsWidths } from "../../obsidian/ui/listWidth";
import { EdgeReveal } from "../../obsidian/ui/projects/EdgeReveal";
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

describe("the phone's left edge (board T5): a held card slides the panel out", () => {
	afterEach(() => vi.useRealTimers());

	it("waits as long as over a tree row, slides the panel out once, and lets it go when the drag ends", () => {
		vi.useFakeTimers();
		const root = document.createElement("div");
		const seen: string[] = [];
		let enabled = true;
		const edge = new EdgeReveal({ root: () => root, enabled: () => enabled, reveal: () => seen.push("out"), ended: () => seen.push("back") });
		expect(edge.hitTest(10)).toBe(true);
		expect(edge.hitTest(40)).toBe(false);
		edge.preview();
		vi.advanceTimersByTime(PROJECTS_HOVER_MS - 1);
		expect(seen).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(seen).toEqual(["out"]);
		enabled = false;
		expect(edge.hitTest(10)).toBe(false);
		expect(edge.drop()).toBeNull();
		edge.clear();
		expect(seen).toEqual(["out", "back"]);
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

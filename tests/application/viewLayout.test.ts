import { describe, expect, it } from "vitest";
import { layoutShareAt, layoutWidths, viewLayout } from "../../core/application/contracts";
import { listWidths } from "../../core/application/listWidth";

const NAMES = { inbox: "Inbox", backlog: "Backlog", soon: "Soon", day: null } as const;
const title = (list: keyof typeof NAMES) => NAMES[list];
const DIVIDER = 16;

/** How each view mode stands on the screen, the same for every frontend (plan 2026-11-12, «Core»). */
describe("the view's layout", () => {
	it("two columns: the ribbon's columns in order, turned by pages", () => {
		const layout = viewLayout("twoColumns", false, title);
		expect(layout).toMatchObject({ mode: "twoColumns", swipe: "pages", divider: true, stack: null });
		expect(layout.columns.map((c) => [c.id, c.lists.map((l) => [l.list, l.title]), c.width])).toEqual([
			["inbox", [["inbox", "Inbox"], ["backlog", "Backlog"]], "half"],
			["soon", [["soon", "Soon"]], "half"],
			["day", [["day", null]], "list"],
			["timeline", [], "rest"],
		]);
	});

	it("all columns: Inbox over Backlog, Soon, the day, the timeline, standing still", () => {
		const layout = viewLayout("allColumns", false, title);
		expect(layout).toMatchObject({ swipe: "none", divider: true, stack: null });
		expect(layout.columns.map((c) => [c.id, c.width])).toEqual([
			["inbox", "list"],
			["soon", "list"],
			["day", "list"],
			["timeline", "rest"],
		]);
	});

	it("rows: the stages stacked in one column that scrolls each list, the timeline behind the divider", () => {
		const layout = viewLayout("rows", false, title);
		expect(layout).toMatchObject({ swipe: "none", divider: true, stack: { lists: ["inbox", "backlog", "soon", "day"], scrolls: true } });
		expect(layout.columns.map((c) => [c.id, c.lists.map((l) => l.title), c.width])).toEqual([
			["rows", ["Inbox", "Backlog", "Soon", null], "list"],
			["timeline", [], "rest"],
		]);
	});

	it("by project: the node's list and the timeline", () => {
		const layout = viewLayout("byProject", false, title);
		expect(layout).toMatchObject({ swipe: "none", divider: true, stack: null });
		expect(layout.columns.map((c) => [c.id, c.lists.map((l) => l.list), c.width])).toEqual([
			["projects", ["projects"], "list"],
			["timeline", [], "rest"],
		]);
	});

	it("a note's block: no timeline, no divider, no swipe; its rows grow instead of scrolling", () => {
		const rows = viewLayout("rows", true, title);
		expect(rows).toMatchObject({ swipe: "none", divider: false, stack: { scrolls: false } });
		expect(rows.columns.map((c) => [c.id, c.width])).toEqual([["rows", "rest"]]);
		expect(viewLayout("byProject", true, title).columns.map((c) => [c.id, c.width])).toEqual([["projects", "rest"]]);
	});
});

describe("the layout's widths", () => {
	it("rows and by project: the list's width beside the timeline, the divider after it", () => {
		const list = listWidths(0.3, 804, DIVIDER);
		for (const mode of ["rows", "byProject"] as const) {
			const widths = layoutWidths(viewLayout(mode, false, title), 0.3, 804, DIVIDER)!;
			expect(widths.widths).toEqual([list.width, 804 - DIVIDER - list.width]);
			expect(widths.divider).toEqual(list);
		}
	});

	it("all columns: three lists as wide as the divider sets, the timeline the rest; four equal at the middle", () => {
		const widths = layoutWidths(viewLayout("allColumns", false, title), 0.5, 804, DIVIDER)!;
		expect(widths.widths).toEqual([189, 189, 189, 804 - 3 * DIVIDER - 3 * 189]);
		expect(widths.divider).toMatchObject({ width: 3 * 189 + 2 * DIVIDER, min: 3 * 110 + 2 * DIVIDER });
	});

	it("a note's block: one column the whole width, no divider", () => {
		expect(layoutWidths(viewLayout("rows", true, title), 0.5, 600, DIVIDER)).toEqual({ widths: [600], divider: null });
	});

	it("two columns: none, the ribbon's own rule sets them by its place", () => {
		expect(layoutWidths(viewLayout("twoColumns", false, title), 0.5, 804, DIVIDER)).toBeNull();
	});

	it("the divider let go: the share it saves gives back where it stood", () => {
		for (const mode of ["rows", "allColumns"] as const) {
			const layout = viewLayout(mode, false, title);
			const share = layoutShareAt(layout, 400, 804, DIVIDER)!;
			expect(layoutWidths(layout, share, 804, DIVIDER)!.divider!.width).toBeCloseTo(400);
		}
		expect(layoutShareAt(viewLayout("rows", true, title), 400, 804, DIVIDER)).toBeNull();
	});
});

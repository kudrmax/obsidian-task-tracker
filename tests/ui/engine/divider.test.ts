import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dividerAt as coreDividerAt, LIST_WIDTHS, listShareOf as coreShareOf, listWidths as coreListWidths } from "../../../core/application/listWidth";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { dividerAt, LIST_BOUNDS, listShareOf, listWidths } from "../../../obsidian/stand/listWidths";
import { SNAP_MS } from "../../../obsidian/ui/engine/gestures/Divider";
import { CALENDAR, dayColumnWidth, landingWidth, ruleShift, strokeWidth } from "../../../obsidian/ui/engine/layout/columns";
import { createScreenStore } from "../../../obsidian/ui/engine/store";

const NOW = new Date(2026, 10, 21, 14, 20);

function screen(share?: number) {
	const port = new MockPort(() => NOW);
	port.delay = 0;
	return createScreenStore(port, undefined, share);
}

/** The stand serves the core's divider rule by the same values until `CorePort` serves the core's own (core audit pair E8). */
describe("the stand's divider rule is the core's", () => {
	it("has the core's bounds and draws every share as the core does", () => {
		expect(LIST_BOUNDS).toEqual(LIST_WIDTHS);
		for (const view of [320, 390, 700, 1280, 1728])
			for (const share of [0, 0.1, 0.3, 0.5, 0.77, 1]) {
				expect(listWidths(share, view, 16)).toEqual(coreListWidths(share, view, 16));
				expect(listShareOf(share * view, view, 16)).toBe(coreShareOf(share * view, view, 16));
			}
	});

	it("stands a dragged divider where the core does, held to the middle only slowly", () => {
		for (const view of [390, 1280]) {
			const widths = coreListWidths(0.5, view, 16);
			for (const wanted of [0, 100, widths.center - 9, widths.center - 3, widths.center + 8, 300, 5000])
				for (const speed of [0, 0.05, 0.08, 0.5]) expect(dividerAt(wanted, widths, speed)).toEqual(coreDividerAt(wanted, widths, speed));
		}
	});
});

describe("the divider's share on the screen", () => {
	it("opens with the halves, or the share the device kept", () => {
		expect(screen().getState().listShare).toBe(0.5);
		expect(screen(0.3).getState().listWidths(390).width).toBeCloseTo(0.3 * 374);
	});

	it("is set where the port's rule stands the divider", () => {
		const store = screen();
		const fast = store.getState().dragDivider(120, 390, 1);
		expect(fast).toEqual({ width: 120, snapped: false });
		expect(store.getState().listWidths(390).width).toBe(120);
		expect(store.getState().dragDivider(190, 390, 0.01)).toEqual({ width: 187, snapped: true });
		expect(store.getState().dragDivider(40, 390, 1).width).toBe(110);
		expect(store.getState().listWidths(390).width).toBe(110);
	});

	it("holds the pointer while dragged: a long press can't lift a card under it, nor the ribbon swipe", () => {
		const store = screen();
		expect(store.getState().claim("divider")).toBe(true);
		expect(store.getState().claim("drag")).toBe(false);
		expect(store.getState().claim("ribbon")).toBe(false);
		store.getState().release("divider");
		expect(store.getState().claim("ribbon")).toBe(true);
		expect(store.getState().claim("divider")).toBe(false);
	});

	it("glides a step into the middle as long as the design's snap", () => {
		const css = readFileSync(join(__dirname, "..", "..", "..", "styles.css"), "utf8");
		expect(css).toContain(`--tc-duration-snap: ${SNAP_MS}ms;`);
	});
});

/**
 * Where the ribbon's columns and dividers stand (the design's «Колонки» and «Переход»): the day list is half the ribbon at
 * Soon and the divider's width at the calendar, each divider in the middle at the stop that shows both its columns and
 * whole past the window's edge where only one shows.
 */
describe("the ribbon's widths", () => {
	it("takes the day list from a half to the divider's width between Soon and the calendar", () => {
		expect(dayColumnWidth(0)).toBe(dayColumnWidth(1));
		expect(dayColumnWidth(1)).toContain(" 0 * ");
		expect(dayColumnWidth(1.5)).toContain(" 0.5 * ");
		expect(dayColumnWidth(CALENDAR)).toContain(" 1 * ");
		expect(dayColumnWidth(CALENDAR + 3)).toBe(dayColumnWidth(CALENDAR));
	});

	it("puts each divider in the middle where both its columns show, past the edge where one does", () => {
		const off = (stop: "inbox" | "soon" | "calendar", at: number) => ruleShift(stop)(at).match(/calc\((-?[\d.]+) \*/)?.[1];
		expect([off("inbox", 0), off("inbox", 1), off("inbox", 2)]).toEqual(["0", "-1", "-1"]);
		expect([off("soon", 0), off("soon", 1), off("soon", 2)]).toEqual(["1", "0", "-1"]);
		expect([off("calendar", 0), off("calendar", 1), off("calendar", 1.5), off("calendar", 2)]).toEqual(["1", "1", "0.5", "0"]);
	});

	it("counts a stroke's px by each place's drawn width, so the columns stay under the fingers", () => {
		const w = { stop: 200, day: 120 };
		expect(strokeWidth(1, -100, w)).toBe(200);
		expect(strokeWidth(CALENDAR, 60, w)).toBe(120);
		expect(strokeWidth(CALENDAR, -100, w)).toBe(200);
		expect(strokeWidth(CALENDAR + 1, -60, w)).toBe(120);
		const across = strokeWidth(CALENDAR - 0.5, 160, w);
		expect(CALENDAR - 0.5 + 160 / across).toBeCloseTo(CALENDAR + 0.5);
		expect(landingWidth(CALENDAR, CALENDAR + 1, w)).toBe(120);
		expect(landingWidth(CALENDAR, 1, w)).toBe(200);
	});

	it("at the halves the divider gave, a day is as wide as a stop: the ribbon as it was", () => {
		for (const view of [390, 1280]) {
			const w = { stop: view / 2, day: listWidths(0.5, view, 16).width + 8 };
			expect(w.day).toBe(w.stop);
			for (const moved of [-300, -10, 10, 300]) expect(strokeWidth(CALENDAR, moved, w)).toBe(view / 2);
		}
	});
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIST_WIDTHS, listWidths as coreListWidths } from "../../../core/application/listWidth";
import { SNAP_MS } from "../../../obsidian/ui/engine/gestures/Divider";
import { CALENDAR, dayColumnWidth, landingWidth, placesAfter, ruleShift } from "../../../obsidian/ui/engine/layout/columns";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 21, 14, 20);

async function screen(share?: number) {
	return createScreenStore((await standPort(NOW)).port, undefined, share);
}

describe("the divider's share on the screen", () => {
	it("opens with the halves, or the share the device kept", async () => {
		expect((await screen()).getState().listShare).toBe(0.5);
		expect((await screen(0.3)).getState().listShare).toBe(0.3);
	});

	it("is set where the port's rule stands the divider", async () => {
		const store = await screen();
		const fast = store.getState().dragDivider(120, 390, 1);
		expect(fast).toEqual({ width: 120, snapped: false });
		expect(store.getState().listShare).toBe(120 / 374);
		expect(store.getState().dragDivider(190, 390, 0.01)).toEqual({ width: 187, snapped: true });
		expect(store.getState().dragDivider(40, 390, 1).width).toBe(110);
		expect(store.getState().listShare).toBe(110 / 374);
	});

	it("holds the pointer while dragged: a long press can't lift a card under it, nor the ribbon swipe", async () => {
		const store = await screen();
		expect(store.getState().claim("divider")).toBe(true);
		expect(store.getState().claim("drag")).toBe(false);
		expect(store.getState().claim("ribbon")).toBe(false);
		store.getState().release("divider");
		expect(store.getState().claim("ribbon")).toBe(true);
		expect(store.getState().claim("divider")).toBe(false);
	});

	it("knows where the middle is, as the port's rule puts it", async () => {
		expect((await screen(0.3)).getState().dividerMiddle(390)).toBe(187);
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

	it("counts the fingers' px by each place's drawn width, so the columns stay under the fingers", () => {
		const w = { stop: 200, day: 120 };
		expect(placesAfter(1, -100, w)).toBe(1 - 100 / 200);
		expect(placesAfter(CALENDAR, 60, w)).toBe(CALENDAR + 60 / 120);
		expect(placesAfter(CALENDAR, -100, w)).toBe(CALENDAR - 100 / 200);
		expect(placesAfter(CALENDAR + 1, -60, w)).toBe(CALENDAR + 1 - 60 / 120);
		expect(placesAfter(CALENDAR - 0.5, 160, w)).toBeCloseTo(CALENDAR + 0.5);
		expect(landingWidth(CALENDAR, CALENDAR + 1, w)).toBe(120);
		expect(landingWidth(CALENDAR, 1, w)).toBe(200);
	});

	it("at the halves the divider gave, a day is as wide as a stop: the pager's own count, the ribbon as it was", () => {
		for (const view of [390, 1280]) {
			const w = { stop: view / 2, day: coreListWidths(0.5, view, 16).width + 8 };
			expect(w.day).toBe(w.stop);
			for (const base of [0, 1, CALENDAR, CALENDAR + 2]) for (const px of [-300, -10, 10, 300]) expect(placesAfter(base, px, w)).toBe(base + px / (view / 2));
		}
	});
});

/**
 * The stylesheet draws the list's width (`--tc-ribbon-list-width`, the one place it is worked out) by the core's rule:
 * the share within the bounds on a phone, a wider window letting it grow until the calendar is as narrow as the list may be.
 */
describe("the stylesheet's list width is the core's", () => {
	const css = readFileSync(join(__dirname, "..", "..", "..", "styles.css"), "utf8");
	const rule = /--tc-ribbon-list-width:\s*(clamp\([^;]+\));/.exec(css)?.[1] ?? "";
	const drawn = (share: number, view: number): number => {
		const expr = rule
			.replaceAll("var(--tc-ribbon-list-least)", String(LIST_WIDTHS.min))
			.replaceAll("var(--tc-ribbon-list-most)", String(LIST_WIDTHS.max))
			.replaceAll("var(--tc-ribbon-list-share)", String(share))
			.replaceAll("var(--tc-divider)", "16")
			.replaceAll("50%", String(view))
			.replaceAll("calc(", "(");
		return new Function("clamp", "max", `return ${expr};`)((lo: number, x: number, hi: number) => Math.max(lo, Math.min(x, hi)), Math.max) as number;
	};

	it("for every window and share", () => {
		expect(rule).not.toBe("");
		for (const view of [280, 320, 390, 430, 600, 700, 1024, 1280, 1728, 2560])
			for (const share of [0, 0.05, 0.2, 0.3, 0.5, 0.65, 0.8, 0.95, 1]) expect(drawn(share, view)).toBeCloseTo(coreListWidths(share, view, 16).width, 9);
	});

});

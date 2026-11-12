import { describe, expect, it } from "vitest";
import { stackedLists, stackedRows } from "../../core/application/contracts";

/** The rows view's lists one under another: each as tall as it is while all fit, the long ones sharing what is left (ported from the app's StackedRowsTests). */
describe("stackedRows", () => {
	it("lists that fit take their own height, never under the least", () => {
		expect(stackedRows([100, 60, 80, 40], 700, 70)).toEqual([100, 70, 80, 70]);
	});

	it("a long list shares what the short ones leave", () => {
		const heights = stackedRows([900, 70, 400, 70], 600, 70);
		expect(heights).toEqual([230, 70, 230, 70]);
		expect(heights.reduce((a, b) => a + b, 0)).toBe(600);
	});

	it("no list is shorter than its title and a card", () => {
		expect(stackedRows([500, 500], 100, 70)).toEqual([70, 70]);
	});

	it("none for no list", () => {
		expect(stackedRows([], 500, 70)).toEqual([]);
	});
});

/**
 * The rows view's lists measured: each list's height and where each of its cards ends (from the list's top, its title
 * in). A list that has to scroll ends under a whole card and the scroll's fade, never on a card (plan 2026-11-12).
 */
describe("stackedLists", () => {
	const FADE = 20;
	/** A title of 30, cards of 60 every 70: a list of `n` cards ends 10 under its last one. */
	const list = (n: number) => ({ wanted: n === 0 ? 90 : 30 + 70 * n, stops: Array.from({ length: n }, (_, i) => 90 + 70 * i) });

	it("lists that fit take their own height", () => {
		expect(stackedLists([list(2), list(0), list(1), list(0)], 700, FADE)).toEqual([170, 90, 100, 90]);
	});

	it("a list that scrolls ends under a whole card and the fade; the short ones keep theirs", () => {
		const heights = stackedLists([list(5), list(1), list(10), list(1)], 600, FADE);
		expect(heights).toEqual([180, 100, 180, 100]);
		for (const [i, n] of [[0, 5], [2, 10]] as const) expect(list(n).stops).toContain(heights[i] - FADE);
	});

	it("room a whole card frees goes to the list it lets show one more", () => {
		expect(stackedLists([list(5), list(0), list(10), list(0)], 650, FADE)).toEqual([250, 90, 180, 90]);
	});

	it("a list let grow to its whole height scrolls no more", () => {
		expect(stackedLists([list(3), list(3)], 430, FADE)).toEqual([240, 180]);
	});

	it("none is shorter than its first card and the fade, or its plate", () => {
		expect(stackedLists([list(5), list(5), list(0)], 100, FADE)).toEqual([110, 110, 90]);
	});

	it("none for no list", () => {
		expect(stackedLists([], 500, FADE)).toEqual([]);
	});
});

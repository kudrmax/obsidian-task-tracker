import { describe, expect, it } from "vitest";
import { stackedRows } from "../../core/application/contracts";

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

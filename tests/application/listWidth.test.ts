import { describe, expect, it } from "vitest";
import { listShareOf, listWidths } from "../../core/application/listWidth";

const DIVIDER = 16;

describe("the list column's width", () => {
	it("keeps the design's bounds on a phone", () => {
		expect(listWidths(0.5, 390, DIVIDER)).toEqual({ width: 187, min: 110, max: 280, center: 187 });
		expect(listWidths(0.9, 390, DIVIDER).width).toBe(280);
		expect(listWidths(0.1, 390, DIVIDER).width).toBe(110);
	});

	it("lets the list grow on a wide window until the timeline is as narrow as the list may be", () => {
		expect(listWidths(0.25, 1616, DIVIDER)).toEqual({ width: 400, min: 110, max: 1600 - 110, center: 800 });
	});

	it("takes the share from the width a divider was let go at", () => {
		expect(listShareOf(400, 1616, DIVIDER)).toBe(0.25);
		expect(listShareOf(listWidths(0, 1601, DIVIDER).center, 1601, DIVIDER)).toBe(0.5);
	});
});

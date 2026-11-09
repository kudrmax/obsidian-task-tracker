import { describe, expect, it } from "vitest";
import { DIVIDER_SNAP, dividerAt, listShareOf, listWidths } from "../../core/application/listWidth";

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

describe("dividerAt", () => {
	const phone = listWidths(0.5, 390, 16);

	it("holds to the middle when brought slowly near it", () => {
		expect(dividerAt(phone.center + 6, phone, 0.02)).toEqual({ width: phone.center, snapped: true });
		expect(dividerAt(phone.center - 8, phone, 0.02)).toEqual({ width: phone.center, snapped: true });
	});

	it("passes the middle when fast, or further than the snap's distance", () => {
		expect(dividerAt(phone.center + 6, phone, DIVIDER_SNAP.slowSpeed)).toEqual({ width: phone.center + 6, snapped: false });
		expect(dividerAt(phone.center + 9.4, phone, 0)).toEqual({ width: phone.center + 9, snapped: false });
	});

	it("stays within the bounds", () => {
		expect(dividerAt(20, phone, 0.5)).toEqual({ width: phone.min, snapped: false });
		expect(dividerAt(1000, phone, 0.5)).toEqual({ width: phone.max, snapped: false });
	});

	it("does not hold to a middle out of reach", () => {
		const narrow = { width: 150, min: 110, max: 160, center: 187 };
		expect(dividerAt(185, narrow, 0)).toEqual({ width: 160, snapped: false });
	});
});

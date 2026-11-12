import { describe, expect, it } from "vitest";
import { allColumnsDividerAt, allColumnsShare, allColumnsWidthAt, allColumnsWidths, DIVIDER_SNAP, dividerAt, listShareOf, listWidths } from "../../core/application/listWidth";

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

describe("All columns' widths (board D1): three lists and the timeline beside the divider, in the core", () => {
	it("stands four equal columns at the middle share, as the board draws them", () => {
		const { width } = allColumnsWidths(0.5, 804, DIVIDER);
		expect(width).toBe(189);
		expect(allColumnsDividerAt(width, DIVIDER)).toBe(3 * 189 + 32);
	});

	it("turns the divider's place back into the lists' width and the share it saves", () => {
		expect(allColumnsWidthAt(allColumnsDividerAt(200, DIVIDER), DIVIDER)).toBe(200);
		const share = allColumnsShare(189, 804, DIVIDER);
		expect(share).toBeCloseTo(0.5);
		expect(allColumnsWidths(share, 804, DIVIDER).width).toBeCloseTo(189);
	});

	it("keeps the timeline at least a list's least width", () => {
		const { width, max } = allColumnsWidths(0.95, 804, DIVIDER);
		expect(width).toBe(max);
		expect(804 - 48 - 3 * max).toBeGreaterThanOrEqual(110);
	});
});

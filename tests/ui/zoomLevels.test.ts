import { describe, expect, it } from "vitest";
import { nearestLevel, stepFor } from "../../src/ui/zoomLevels";

const levels = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];

describe("zoom levels", () => {
	it("finds the nearest level", () => {
		expect(nearestLevel(60, levels)).toEqual({ hourPx: 56 });
		expect(nearestLevel(90, levels)).toEqual({ hourPx: 112 });
		expect(nearestLevel(10, levels)).toEqual({ hourPx: 28 });
		expect(nearestLevel(999, levels)).toEqual({ hourPx: 224 });
	});
});

describe("stepFor", () => {
	it("takes the finest of 5, 15, 30 and 60 minutes that a finger still moves a step at", () => {
		expect(stepFor(28)).toBe(30);
		expect(stepFor(56)).toBe(15);
		expect(stepFor(112)).toBe(5);
		expect(stepFor(224)).toBe(5);
	});

	it("follows the height between the levels too, as a pinch passes them", () => {
		expect(stepFor(36)).toBe(15);
		expect(stepFor(35)).toBe(30);
		expect(stepFor(100)).toBe(15);
		expect(stepFor(108)).toBe(5);
	});

	it("falls back to an hour when the day is squeezed tighter still", () => {
		expect(stepFor(10)).toBe(60);
		expect(stepFor(4)).toBe(60);
	});
});

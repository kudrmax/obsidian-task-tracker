import { describe, expect, it } from "vitest";
import { nearestLevel, stepFor } from "../../src/ui/zoomLevels";

const levels = [
	{ hourPx: 28, stepMinutes: 60 },
	{ hourPx: 56, stepMinutes: 30 },
	{ hourPx: 112, stepMinutes: 15 },
	{ hourPx: 224, stepMinutes: 5 },
];

describe("zoom levels", () => {
	it("finds the nearest level", () => {
		expect(nearestLevel(60, levels)).toEqual({ hourPx: 56, stepMinutes: 30 });
		expect(nearestLevel(90, levels)).toEqual({ hourPx: 112, stepMinutes: 15 });
		expect(nearestLevel(10, levels)).toEqual({ hourPx: 28, stepMinutes: 60 });
		expect(nearestLevel(999, levels)).toEqual({ hourPx: 224, stepMinutes: 5 });
	});

	it("gives the step of the nearest level", () => {
		expect(stepFor(56, levels)).toBe(30);
		expect(stepFor(200, levels)).toBe(5);
	});
});

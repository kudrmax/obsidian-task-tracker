import { describe, expect, it } from "vitest";
import { snapMinutes } from "../../src/ui/drag/snap";

describe("snapMinutes", () => {
	it("rounds to the nearest step", () => {
		expect(snapMinutes(37, 30)).toBe(30);
		expect(snapMinutes(46, 30)).toBe(60);
		expect(snapMinutes(52, 15)).toBe(45);
		expect(snapMinutes(53, 15)).toBe(60);
	});

	it("keeps to the day", () => {
		expect(snapMinutes(-5, 15)).toBe(0);
		expect(snapMinutes(1437, 30)).toBe(1440);
		expect(snapMinutes(1500, 30)).toBe(1440);
	});
});

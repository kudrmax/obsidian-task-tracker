// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { navigationClear, statusClear } from "../../src/ui/chrome";

const VIEW = new DOMRect(344, 78, 856, 722);

describe("Obsidian's chrome over the view", () => {
	it("the phone navigation: from the view's bottom up to its top, none while hidden", () => {
		expect(navigationClear(new DOMRect(0, 0, 390, 844), new DOMRect(37, 760, 316, 52))).toBe(84);
		expect(navigationClear(new DOMRect(0, 0, 390, 844), new DOMRect(0, 0, 0, 0))).toBe(0);
		expect(navigationClear(VIEW, null)).toBe(0);
	});

	it("the desktop status bar: from the view's right edge in to its left, when it lies over the view", () => {
		expect(statusClear(VIEW, new DOMRect(1163, 775, 37, 25))).toBe(37);
		expect(statusClear(VIEW, new DOMRect(1163, 805, 37, 25))).toBe(0);
		expect(statusClear(VIEW, new DOMRect(0, 0, 0, 0))).toBe(0);
		expect(statusClear(VIEW, null)).toBe(0);
	});
});

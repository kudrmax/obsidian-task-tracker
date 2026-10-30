import { describe, expect, it } from "vitest";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "../../src/ui/listWidth";

describe("list width", () => {
	it("keeps the design's bounds on a phone", () => {
		expect(listWidthMax(390)).toBe(280);
	});

	it("lets the list grow on a wide window until the timeline is as narrow as the list may be", () => {
		expect(listWidthMax(1600)).toBe(1600 - 16 - 110);
	});

	it("gives the list its share of the width the columns split", () => {
		expect(shownListWidth(0.25, 1616)).toBe(400);
	});

	it("keeps a divider in the middle there as the window changes", () => {
		expect(shownListWidth(0.5, 390)).toBe(centeredListWidth(390));
		expect(shownListWidth(0.5, 1601)).toBe(centeredListWidth(1601));
	});

	it("keeps the list within its bounds whatever its share", () => {
		expect(shownListWidth(0.9, 390)).toBe(280);
		expect(shownListWidth(0.1, 390)).toBe(110);
	});

	it("takes the share from the width the divider was let go at", () => {
		expect(listShareOf(400, 1616)).toBe(0.25);
		expect(listShareOf(centeredListWidth(1601), 1601)).toBe(0.5);
	});

	it("centres the divider's line in the window", () => {
		expect(centeredListWidth(390)).toBe(187);
		expect(centeredListWidth(1601)).toBe(792.5);
	});
});

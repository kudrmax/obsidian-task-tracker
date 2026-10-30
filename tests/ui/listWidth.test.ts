import { describe, expect, it } from "vitest";
import { listWidthMax, shownListWidth } from "../../src/ui/listWidth";

describe("list width", () => {
	it("keeps the design's bounds on a phone", () => {
		expect(listWidthMax(390)).toBe(280);
	});

	it("lets the list grow on a wide window until the timeline is as narrow as the list may be", () => {
		expect(listWidthMax(1600)).toBe(1600 - 16 - 110);
	});

	it("shows the saved width while it fits the window", () => {
		expect(shownListWidth(800, 1600)).toBe(800);
	});

	it("narrows a saved width that no longer fits the window", () => {
		expect(shownListWidth(800, 390)).toBe(280);
	});

	it("keeps the saved width while the view has no width yet", () => {
		expect(shownListWidth(800, 0)).toBe(800);
	});
});

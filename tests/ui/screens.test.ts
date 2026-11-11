import { describe, expect, it } from "vitest";
import { placeIndex, placeShowing, shownLists, SCREEN_PLACES } from "../../obsidian/ui/screens";

describe("the Projects place on the wheel (board Nav)", () => {
	it("stands first on the wheel, the folder alone in the middle of the window, Done holding Inbox alone", () => {
		expect(SCREEN_PLACES[0]).toBe("projects");
		expect(placeIndex("projects")).toBe(-0.5);
		expect(placeIndex("done")).toBe(0.5);
		expect(placeIndex("inbox")).toBe(1);
		expect(placeIndex("calendar")).toBe(3);
	});

	it("shows none of the funnel's lists, and a list asked for from there turns to the nearest place from Inbox", () => {
		expect(shownLists("projects")).toEqual([]);
		expect(placeShowing("soon", "projects")).toBe("inbox");
		expect(placeShowing("day", "projects")).toBe("soon");
	});
});

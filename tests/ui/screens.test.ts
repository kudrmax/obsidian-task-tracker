import { describe, expect, it } from "vitest";
import { stepScreen } from "../../core/application/screenPlaces";
import { placeIndex, placeOfList, shownLists, stepWithProjects, WHEEL_PLACES } from "../../obsidian/ui/screens";

const TODAY = "2026-11-01";
const step = (mode: Parameters<typeof stepWithProjects>[0]["mode"], shift: -1 | 1) => stepWithProjects({ mode, date: TODAY }, shift, (from, way) => stepScreen(from, way, TODAY));

describe("the Projects place left of Inbox (board Nav)", () => {
	it("is reached by a step back from Inbox and from Done, and left for Inbox by a step on", () => {
		expect(step("inbox", -1)).toEqual({ mode: "projects", date: TODAY });
		expect(step("done", -1)).toEqual({ mode: "projects", date: TODAY });
		expect(step("projects", 1)).toEqual({ mode: "inbox", date: TODAY });
	});

	it("is the row's first screen: nothing lies before it", () => {
		expect(step("projects", -1)).toBeNull();
	});

	it("leaves the core's row as it was past Inbox", () => {
		expect(step("inbox", 1)).toEqual({ mode: "soon", date: TODAY });
		expect(step("soon", -1)).toEqual({ mode: "inbox", date: TODAY });
	});

	it("stands first on the wheel, the folder alone in the middle of the window, Done holding Inbox alone", () => {
		expect(WHEEL_PLACES[0]).toBe("projects");
		expect(placeIndex("projects")).toBe(-0.5);
		expect(placeIndex("done")).toBe(0.5);
		expect(placeIndex("inbox")).toBe(1);
	});

	it("shows none of the funnel's lists, and a list asked for from there turns to the nearest place from Inbox", () => {
		expect(shownLists("projects")).toEqual([]);
		expect(placeOfList("soon", "projects")).toBe("inbox");
		expect(placeOfList("day", "projects")).toBe("soon");
	});
});

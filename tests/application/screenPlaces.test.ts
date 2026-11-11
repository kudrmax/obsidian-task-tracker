import { describe, expect, it } from "vitest";
import { placeShowing, SCREEN_PLACES, SHOWN_LISTS, shownLists } from "../../core/application/contracts";

describe("the screen's places", () => {
	it("stand left to right as Projects, Inbox, Soon and the calendar, each showing its lists in their order; Projects none", () => {
		expect(SCREEN_PLACES).toEqual(["projects", "inbox", "soon", "calendar"]);
		expect(SHOWN_LISTS).toEqual({ projects: [], inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] });
		expect(shownLists("projects")).toEqual([]);
		expect(shownLists("soon")).toEqual(["soon", "day"]);
	});

	it("a list is shown where the screen stands when it shows it, else from the nearest place that does; from Projects as from Inbox", () => {
		const turns = SCREEN_PLACES.map((from) => [from, (["inbox", "backlog", "soon", "day"] as const).map((column) => placeShowing(column, from))]);
		expect(turns).toEqual([
			["projects", ["inbox", "inbox", "inbox", "soon"]],
			["inbox", ["inbox", "inbox", "inbox", "soon"]],
			["soon", ["inbox", "inbox", "soon", "soon"]],
			["calendar", ["inbox", "inbox", "soon", "calendar"]],
		]);
	});
});

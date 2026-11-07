import { describe, expect, it } from "vitest";
import { placeShowing, SCREEN_PLACES, SHOWN_LISTS } from "../../core/application/contracts";

describe("the screen's places", () => {
	it("stand left to right as Inbox, Soon and the calendar, each showing its lists in their order", () => {
		expect(SCREEN_PLACES).toEqual(["inbox", "soon", "calendar"]);
		expect(SHOWN_LISTS).toEqual({ inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] });
	});

	it("a list is shown where the screen stands when it shows it, else from the nearest place that does", () => {
		const turns = SCREEN_PLACES.map((from) => [from, (["inbox", "backlog", "soon", "day"] as const).map((column) => placeShowing(column, from))]);
		expect(turns).toEqual([
			["inbox", ["inbox", "inbox", "inbox", "soon"]],
			["soon", ["inbox", "inbox", "soon", "soon"]],
			["calendar", ["inbox", "inbox", "soon", "calendar"]],
		]);
	});
});

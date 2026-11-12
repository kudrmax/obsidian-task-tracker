import { describe, expect, it } from "vitest";
import { FUNNEL_PLACES, funnelPlaceShowing, SHOWN_LISTS } from "../../core/application/contracts";

describe("the funnel's places", () => {
	it("stand left to right as Inbox, Soon and the calendar, each showing its lists in their order", () => {
		expect(FUNNEL_PLACES).toEqual(["inbox", "soon", "calendar"]);
		expect(SHOWN_LISTS).toEqual({ inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] });
	});

	it("a list is shown where the screen stands when it shows it, else from the nearest place that does; from Done as from Inbox", () => {
		const turns = (["done", ...FUNNEL_PLACES] as const).map((from) => [from, (["inbox", "backlog", "soon", "day"] as const).map((column) => funnelPlaceShowing(column, from))]);
		expect(turns).toEqual([
			["done", ["inbox", "inbox", "inbox", "soon"]],
			["inbox", ["inbox", "inbox", "inbox", "soon"]],
			["soon", ["inbox", "inbox", "soon", "soon"]],
			["calendar", ["inbox", "inbox", "soon", "calendar"]],
		]);
	});
});

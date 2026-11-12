import { describe, expect, it } from "vitest";
import { funnelPlaceShowing, FUNNEL_PLACES, placeIndex, WHEEL_END } from "../../obsidian/ui/screens";

describe("the wheel walks the funnel alone (spec 2026-11-12 «Projects one view»: the tree is a panel, no place)", () => {
	it("stands Inbox first, a place per icon to the calendar, Done holding Inbox alone half a place before it", () => {
		expect(FUNNEL_PLACES).toEqual(["inbox", "soon", "calendar"]);
		expect(placeIndex("done")).toBe(-0.5);
		expect(placeIndex("inbox")).toBe(0);
		expect(placeIndex("soon")).toBe(1);
		expect(placeIndex("calendar")).toBe(2);
		expect(WHEEL_END).toBe(2);
	});

	it("turns to the nearest place that shows a list, from Done as from Inbox", () => {
		expect(funnelPlaceShowing("soon", "done")).toBe("inbox");
		expect(funnelPlaceShowing("day", "inbox")).toBe("soon");
	});
});

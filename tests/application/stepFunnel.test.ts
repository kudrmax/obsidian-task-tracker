import { describe, expect, it } from "vitest";
import { stepFunnel } from "../../core/application/screenPlaces";
import { placeIndex } from "../../obsidian/ui/screens";

const TODAY = "2026-11-01";
const DAYS = TODAY;

describe("stepFunnel", () => {
	it("walks the screens left to right: Inbox and Soon, Soon and Now, Now and the calendar, then on through the days", () => {
		expect(stepFunnel({ mode: "inbox", date: TODAY }, 1, DAYS)).toEqual({ mode: "soon", date: TODAY });
		expect(stepFunnel({ mode: "soon", date: TODAY }, 1, DAYS)).toEqual({ mode: "calendar", date: TODAY });
		expect(stepFunnel({ mode: "calendar", date: TODAY }, 1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-02" });
		expect(stepFunnel({ mode: "calendar", date: "2026-11-02" }, 1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-03" });
	});

	it("walks back the same way, from a later day to today and from today to the lists", () => {
		expect(stepFunnel({ mode: "calendar", date: "2026-11-03" }, -1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-02" });
		expect(stepFunnel({ mode: "calendar", date: "2026-11-02" }, -1, DAYS)).toEqual({ mode: "calendar", date: TODAY });
		expect(stepFunnel({ mode: "calendar", date: TODAY }, -1, DAYS)).toEqual({ mode: "soon", date: TODAY });
		expect(stepFunnel({ mode: "soon", date: TODAY }, -1, DAYS)).toEqual({ mode: "inbox", date: TODAY });
	});

	it("stands nothing before Inbox, the first screen: Projects are a panel, no place", () => {
		expect(stepFunnel({ mode: "inbox", date: TODAY }, -1, DAYS)).toBeNull();
	});

	it("keeps the day the arrows chose while it moves between the lists and the calendar", () => {
		expect(stepFunnel({ mode: "soon", date: "2026-11-05" }, 1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-05" });
		expect(stepFunnel({ mode: "soon", date: "2026-11-05" }, -1, DAYS)).toEqual({ mode: "inbox", date: "2026-11-05" });
	});

	it("walks a past day further back, since the lists stand before today only", () => {
		expect(stepFunnel({ mode: "calendar", date: "2026-10-31" }, -1, DAYS)).toEqual({ mode: "calendar", date: "2026-10-30" });
		expect(stepFunnel({ mode: "calendar", date: "2026-10-31" }, 1, DAYS)).toEqual({ mode: "calendar", date: TODAY });
	});

	it("goes from Done, left of Inbox, on to Inbox and nowhere back; nothing leads back to Done", () => {
		expect(placeIndex("done")).toBeLessThan(placeIndex("inbox"));
		expect(stepFunnel({ mode: "done", date: TODAY }, 1, DAYS)).toEqual({ mode: "inbox", date: TODAY });
		expect(stepFunnel({ mode: "done", date: TODAY }, -1, DAYS)).toBeNull();
	});
});

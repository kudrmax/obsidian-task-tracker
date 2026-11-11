import { describe, expect, it } from "vitest";
import { stepScreen, stepWheel } from "../../core/application/screenPlaces";
import { placeIndex } from "../../obsidian/ui/screens";

const TODAY = "2026-11-01";
const DAYS = TODAY;

describe("stepScreen", () => {
	it("walks the screens left to right: Inbox and Soon, Soon and Now, Now and the calendar, then on through the days", () => {
		expect(stepScreen({ mode: "inbox", date: TODAY }, 1, DAYS)).toEqual({ mode: "soon", date: TODAY });
		expect(stepScreen({ mode: "soon", date: TODAY }, 1, DAYS)).toEqual({ mode: "calendar", date: TODAY });
		expect(stepScreen({ mode: "calendar", date: TODAY }, 1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-02" });
		expect(stepScreen({ mode: "calendar", date: "2026-11-02" }, 1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-03" });
	});

	it("walks back the same way, from a later day to today and from today to the lists", () => {
		expect(stepScreen({ mode: "calendar", date: "2026-11-03" }, -1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-02" });
		expect(stepScreen({ mode: "calendar", date: "2026-11-02" }, -1, DAYS)).toEqual({ mode: "calendar", date: TODAY });
		expect(stepScreen({ mode: "calendar", date: TODAY }, -1, DAYS)).toEqual({ mode: "soon", date: TODAY });
		expect(stepScreen({ mode: "soon", date: TODAY }, -1, DAYS)).toEqual({ mode: "inbox", date: TODAY });
	});

	it("goes nowhere back from Inbox and Soon, the first screen", () => {
		expect(stepScreen({ mode: "inbox", date: TODAY }, -1, DAYS)).toBeNull();
	});

	it("keeps the day the arrows chose while it moves between the lists and the calendar", () => {
		expect(stepScreen({ mode: "soon", date: "2026-11-05" }, 1, DAYS)).toEqual({ mode: "calendar", date: "2026-11-05" });
		expect(stepScreen({ mode: "soon", date: "2026-11-05" }, -1, DAYS)).toEqual({ mode: "inbox", date: "2026-11-05" });
	});

	it("walks a past day further back, since the lists stand before today only", () => {
		expect(stepScreen({ mode: "calendar", date: "2026-10-31" }, -1, DAYS)).toEqual({ mode: "calendar", date: "2026-10-30" });
		expect(stepScreen({ mode: "calendar", date: "2026-10-31" }, 1, DAYS)).toEqual({ mode: "calendar", date: TODAY });
	});

	it("goes from Done on to Inbox, and nothing leads back to Done", () => {
		expect(placeIndex("done")).toBeLessThan(placeIndex("inbox"));
		expect(stepScreen({ mode: "done", date: TODAY }, 1, DAYS)).toEqual({ mode: "inbox", date: TODAY });
		expect(stepScreen({ mode: "done", date: TODAY }, -1, DAYS)).toBeNull();
		expect(stepScreen({ mode: "inbox", date: TODAY }, -1, DAYS)).toBeNull();
	});
});

describe("stepWheel: the screens with Projects first, left of Inbox", () => {
	it("goes back from Inbox and Soon to Projects, nowhere back from there, and on from it to Inbox", () => {
		expect(stepWheel({ mode: "inbox", date: TODAY }, -1, DAYS)).toEqual({ mode: "projects", date: TODAY });
		expect(stepWheel({ mode: "projects", date: TODAY }, -1, DAYS)).toBeNull();
		expect(stepWheel({ mode: "projects", date: TODAY }, 1, DAYS)).toEqual({ mode: "inbox", date: TODAY });
	});

	it("goes from Done on to Inbox and back to Projects; the rest walks as stepScreen", () => {
		expect(stepWheel({ mode: "done", date: TODAY }, 1, DAYS)).toEqual({ mode: "inbox", date: TODAY });
		expect(stepWheel({ mode: "done", date: TODAY }, -1, DAYS)).toEqual({ mode: "projects", date: TODAY });
		expect(stepWheel({ mode: "inbox", date: TODAY }, 1, DAYS)).toEqual({ mode: "soon", date: TODAY });
		expect(stepWheel({ mode: "calendar", date: TODAY }, -1, DAYS)).toEqual({ mode: "soon", date: TODAY });
	});
});

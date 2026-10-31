import { describe, expect, it } from "vitest";
import { stepScreen } from "../../src/ui/screens";

const TODAY = "2026-11-01";

describe("stepScreen", () => {
	it("walks the screens left to right: Inbox and Soon, Soon and Now, Now and the calendar, then on through the days", () => {
		expect(stepScreen({ mode: "inbox", date: TODAY }, 1, TODAY)).toEqual({ mode: "soon", date: TODAY });
		expect(stepScreen({ mode: "soon", date: TODAY }, 1, TODAY)).toEqual({ mode: "calendar", date: TODAY });
		expect(stepScreen({ mode: "calendar", date: TODAY }, 1, TODAY)).toEqual({ mode: "calendar", date: "2026-11-02" });
		expect(stepScreen({ mode: "calendar", date: "2026-11-02" }, 1, TODAY)).toEqual({ mode: "calendar", date: "2026-11-03" });
	});

	it("walks back the same way, from a later day to today and from today to the lists", () => {
		expect(stepScreen({ mode: "calendar", date: "2026-11-03" }, -1, TODAY)).toEqual({ mode: "calendar", date: "2026-11-02" });
		expect(stepScreen({ mode: "calendar", date: "2026-11-02" }, -1, TODAY)).toEqual({ mode: "calendar", date: TODAY });
		expect(stepScreen({ mode: "calendar", date: TODAY }, -1, TODAY)).toEqual({ mode: "soon", date: TODAY });
		expect(stepScreen({ mode: "soon", date: TODAY }, -1, TODAY)).toEqual({ mode: "inbox", date: TODAY });
	});

	it("goes nowhere back from Inbox and Soon, the first screen", () => {
		expect(stepScreen({ mode: "inbox", date: TODAY }, -1, TODAY)).toBeNull();
	});

	it("keeps the day the arrows chose while it moves between the lists and the calendar", () => {
		expect(stepScreen({ mode: "soon", date: "2026-11-05" }, 1, TODAY)).toEqual({ mode: "calendar", date: "2026-11-05" });
		expect(stepScreen({ mode: "soon", date: "2026-11-05" }, -1, TODAY)).toEqual({ mode: "inbox", date: "2026-11-05" });
	});

	it("walks a past day further back, since the lists stand before today only", () => {
		expect(stepScreen({ mode: "calendar", date: "2026-10-31" }, -1, TODAY)).toEqual({ mode: "calendar", date: "2026-10-30" });
		expect(stepScreen({ mode: "calendar", date: "2026-10-31" }, 1, TODAY)).toEqual({ mode: "calendar", date: TODAY });
	});
});

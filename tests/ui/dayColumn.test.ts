import { describe, expect, it } from "vitest";
import { dayColumn } from "../../src/ui/dayColumn";

const TODAY = "2026-11-01";

describe("dayColumn", () => {
	it("today: Now, with its sections", () => {
		expect(dayColumn(TODAY, TODAY)).toEqual({ list: "now", date: null, sections: true });
	});

	it("a later day: Soon with that day, with Soon's sections", () => {
		expect(dayColumn("2026-11-05", TODAY)).toEqual({ list: "soon", date: "2026-11-05", sections: true });
	});

	it("a past day: Now with that day, no sections", () => {
		expect(dayColumn("2026-10-28", TODAY)).toEqual({ list: "now", date: "2026-10-28", sections: false });
	});
});

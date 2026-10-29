import { describe, expect, it } from "vitest";
import { dayTitle } from "../../src/ui/dayTitle";

describe("dayTitle", () => {
	it("names today and its neighbours", () => {
		expect(dayTitle("2026-10-30", "2026-10-30")).toBe("Today");
		expect(dayTitle("2026-10-31", "2026-10-30")).toBe("Tomorrow");
		expect(dayTitle("2026-10-29", "2026-10-30")).toBe("Yesterday");
	});

	it("writes any other day as weekday, day and month", () => {
		expect(dayTitle("2026-11-03", "2026-10-30")).toBe("Tue, 3 Nov");
		expect(dayTitle("2026-01-01", "2026-10-30")).toBe("Thu, 1 Jan");
	});

	it("adds the year when it is not this year", () => {
		expect(dayTitle("2027-11-03", "2026-10-30")).toBe("Wed, 3 Nov 2027");
		expect(dayTitle("2025-12-30", "2026-01-01")).toBe("Tue, 30 Dec 2025");
	});
});

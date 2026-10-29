import { describe, expect, it } from "vitest";
import { addDays, formatTime, localDateOf, minutesOf, monthAbbreviation, dayOfMonth } from "../../src/ui/dates";

describe("dates", () => {
	it("writes a Date as a local calendar day", () => {
		expect(localDateOf(new Date(2026, 9, 30, 14, 20))).toBe("2026-10-30");
		expect(localDateOf(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
	});

	it("steps days across month and year ends", () => {
		expect(addDays("2026-10-30", 1)).toBe("2026-10-31");
		expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
	});

	it("reads the day and the month of a due date for a card", () => {
		expect(dayOfMonth("2026-11-03")).toBe("3");
		expect(monthAbbreviation("2026-11-03")).toBe("NOV");
		expect(monthAbbreviation("2026-10-30")).toBe("OCT");
	});

	it("counts minutes of the day and writes them back", () => {
		expect(minutesOf(new Date(2026, 9, 30, 14, 20))).toBe(860);
		expect(formatTime(860)).toBe("14:20");
		expect(formatTime(540)).toBe("09:00");
		expect(formatTime(990)).toBe("16:30");
	});
});

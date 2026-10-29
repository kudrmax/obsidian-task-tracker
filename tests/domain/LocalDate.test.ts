import { describe, expect, it } from "vitest";
import { addDays, isValidLocalDate, localDateOf, minutesToHHMM, parseHHMM } from "../../src/domain/LocalDate";

describe("LocalDate", () => {
	it("formats the machine's local date", () => {
		expect(localDateOf(new Date(2026, 9, 30, 23, 59))).toBe("2026-10-30");
		expect(localDateOf(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
	});

	it("adds days across a month end", () => {
		expect(addDays("2026-10-30", 2)).toBe("2026-11-01");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
		expect(addDays("2026-10-30", 0)).toBe("2026-10-30");
	});

	it("formats minutes", () => {
		expect(minutesToHHMM(5)).toBe("00:05");
		expect(minutesToHHMM(600)).toBe("10:00");
		expect(minutesToHHMM(1440)).toBe("24:00");
	});

	it("validates a date", () => {
		expect(isValidLocalDate("2026-10-30")).toBe(true);
		expect(isValidLocalDate("2024-02-29")).toBe(true);
		expect(isValidLocalDate("2026-13-40")).toBe(false);
		expect(isValidLocalDate("2026-02-29")).toBe(false);
		expect(isValidLocalDate("2026-1-5")).toBe(false);
	});

	it("parses HH:MM", () => {
		expect(parseHHMM("09:05")).toBe(545);
		expect(parseHHMM("24:00")).toBe(1440);
		expect(parseHHMM("25:00")).toBeNull();
		expect(parseHHMM("10:60")).toBeNull();
		expect(parseHHMM("9:05")).toBeNull();
	});
});

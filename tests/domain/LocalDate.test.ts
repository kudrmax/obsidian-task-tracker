import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysInMonth, weekdayOf, isValidLocalDate, localDateOf, minutesToHHMM, parseHHMM } from "../../core/domain/LocalDate";

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

	it("validates every day of four centuries as the calendar has it, without a Date", () => {
		const viaDate = (s: string) => {
			const [y, m, d] = s.split("-").map(Number);
			return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === s;
		};
		const pad = (n: number) => String(n).padStart(2, "0");
		for (const year of [1000, 1900, 1999, 2000, 2024, 2026, 2100, 2400, 9999])
			for (let month = 0; month <= 13; month++)
				for (let day = 0; day <= 32; day++) {
					const s = `${year}-${pad(month)}-${pad(day)}`;
					expect([s, isValidLocalDate(s)]).toEqual([s, viaDate(s)]);
				}
		expect(isValidLocalDate("0999-01-01")).toBe(false);
		expect([daysInMonth(2024, 2), daysInMonth(1900, 2), daysInMonth(2000, 2), daysInMonth(2026, 13), daysInMonth(2026, 0)]).toEqual([29, 28, 29, 31, 31]);
	});

	it("parses HH:MM", () => {
		expect(parseHHMM("09:05")).toBe(545);
		expect(parseHHMM("24:00")).toBe(1440);
		expect(parseHHMM("25:00")).toBeNull();
		expect(parseHHMM("10:60")).toBeNull();
		expect(parseHHMM("9:05")).toBeNull();
	});

	it("adds months, clamping to the last day", () => {
		expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
		expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
		expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
		expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
		expect(addMonths("2026-01-15", -2)).toBe("2025-11-15");
	});

	it("numbers weekdays from Monday", () => {
		expect(weekdayOf("2026-11-02")).toBe(0);
		expect(weekdayOf("2026-11-08")).toBe(6);
	});
});

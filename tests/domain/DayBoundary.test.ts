import { describe, expect, it } from "vitest";
import { DayBoundary } from "../../src/domain/DayBoundary";

const AT_FOUR = new DayBoundary(4);
const D = "2026-10-30";
const NEXT = "2026-10-31";

describe("DayBoundary", () => {
	it("at midnight a moment belongs to its own date", () => {
		expect(DayBoundary.MIDNIGHT.dayOf(new Date(2026, 9, 30, 0, 0))).toBe(D);
		expect(DayBoundary.MIDNIGHT.dayOf(new Date(2026, 9, 30, 23, 59))).toBe(D);
	});

	it("before the start hour a moment still belongs to the day before", () => {
		expect(AT_FOUR.dayOf(new Date(2026, 9, 31, 3, 59))).toBe(D);
		expect(AT_FOUR.dayOf(new Date(2026, 9, 31, 4, 0))).toBe(NEXT);
	});

	it("a slot belongs to the day its start falls in", () => {
		expect(AT_FOUR.dayOfSlot({ date: NEXT, start: 60, end: 120 })).toBe(D);
		expect(AT_FOUR.dayOfSlot({ date: D, start: 240, end: 300 })).toBe(D);
		expect(DayBoundary.MIDNIGHT.dayOfSlot({ date: NEXT, start: 60, end: 120 })).toBe(NEXT);
	});

	it("measures a moment in minutes from the start of a day", () => {
		expect(AT_FOUR.offsetOf(D, new Date(2026, 9, 30, 4, 0))).toBe(0);
		expect(AT_FOUR.offsetOf(D, new Date(2026, 9, 31, 1, 30))).toBe(21 * 60 + 30);
		expect(AT_FOUR.offsetOf(D, new Date(2026, 9, 30, 2, 0))).toBe(-120);
	});

	it("measures a slot from the start of its day, over midnight too", () => {
		expect(AT_FOUR.spanOf({ date: NEXT, start: 60, end: 120 }, D)).toEqual({ start: 1260, end: 1320 });
		expect(AT_FOUR.spanOf({ date: D, start: 1380, end: 1500 }, D)).toEqual({ start: 1140, end: 1260 });
	});

	it("turns minutes from the start of a day into a slot at the clock's time and date", () => {
		expect(AT_FOUR.slotAt(D, 0, 60)).toEqual({ date: D, start: 240, end: 300 });
		expect(AT_FOUR.slotAt(D, 1260, 1320)).toEqual({ date: NEXT, start: 60, end: 120 });
		expect(AT_FOUR.slotAt(D, 1140, 1260)).toEqual({ date: D, start: 1380, end: 1500 });
		expect(DayBoundary.MIDNIGHT.slotAt(D, 1380, 1440)).toEqual({ date: D, start: 1380, end: 1440 });
	});

	it("names the hour each line of the day starts at", () => {
		expect(AT_FOUR.hourAt(0)).toBe(4);
		expect(AT_FOUR.hourAt(20)).toBe(0);
		expect(AT_FOUR.hourAt(23)).toBe(3);
	});

	it("measures a clock hour from the start of the day", () => {
		expect(AT_FOUR.offsetOfHour(9)).toBe(300);
		expect(AT_FOUR.offsetOfHour(2)).toBe(22 * 60);
	});

	it("keeps a slot inside its day and at least one step long", () => {
		expect(AT_FOUR.clamp({ date: D, start: 1380, end: 1700 }, 5)).toEqual({ date: D, start: 1380, end: 1680 });
		expect(AT_FOUR.clamp({ date: NEXT, start: 235, end: 236 }, 5)).toEqual({ date: NEXT, start: 231, end: 236 });
		expect(DayBoundary.MIDNIGHT.clamp({ date: D, start: 1420, end: 1480 }, 5)).toEqual({ date: D, start: 1420, end: 1440 });
		expect(DayBoundary.MIDNIGHT.clamp({ date: D, start: 1440, end: 1445 }, 5)).toEqual({ date: D, start: 1435, end: 1440 });
		expect(DayBoundary.MIDNIGHT.clamp({ date: D, start: 1420, end: 1480 }, 30)).toEqual({ date: D, start: 1410, end: 1440 });
		expect(DayBoundary.MIDNIGHT.clamp({ date: D, start: -10, end: 50 }, 30)).toEqual({ date: D, start: 0, end: 60 });
		expect(DayBoundary.MIDNIGHT.clamp({ date: D, start: 600, end: 660 }, 30)).toEqual({ date: D, start: 600, end: 660 });
	});

	it("takes only a whole hour of the day", () => {
		expect(new DayBoundary(4.7).startHour).toBe(4);
		expect(new DayBoundary(-3).startHour).toBe(0);
		expect(new DayBoundary(30).startHour).toBe(0);
		expect(new DayBoundary(Number.NaN).startHour).toBe(0);
	});
});

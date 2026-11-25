import { describe, expect, it } from "vitest";
import { CALENDAR, DayLine, offsetOf, stepped } from "../../../obsidian/ui/engine/layout/columns";

describe("the day line past the calendar (Decision 146)", () => {
	it("stands today at the calendar and each day after it one place on", () => {
		const line = DayLine.plain(0);
		expect(line.placeOf("calendar", 0)).toBe(CALENDAR);
		expect(line.placeOf("calendar", 3)).toBe(CALENDAR + 3);
		expect(line.placeOf("soon", 0)).toBe(offsetOf("soon"));
		expect(line.dayAt(CALENDAR + 2)).toBe(2);
		expect(line.dayAt(offsetOf("soon"))).toBe(0);
	});

	it("puts an earlier day at the calendar once the arrow goes back to it, today one place on", () => {
		const back = DayLine.plain(0).toward(CALENDAR, "calendar", -1);
		expect(back.placeOf("calendar", -1)).toBe(CALENDAR);
		expect(back.placeOf("calendar", 0)).toBe(CALENDAR + 1);
		expect(DayLine.plain(0).moved(CALENDAR, back)).toBe(CALENDAR + 1);
		expect(back.isPlain(-1)).toBe(true);
	});

	it("draws a far day beside the day turned to, so the turn is one page (F45)", () => {
		const home = DayLine.plain(5).toward(CALENDAR + 5, "calendar", 0);
		expect(home.pos(5)).toBe(1);
		expect(home.pos(0)).toBe(0);
		expect(DayLine.plain(5).moved(CALENDAR + 5, home)).toBe(CALENDAR + 1);
		expect(home.isPlain(0)).toBe(false);
		const ahead = DayLine.plain(0).toward(offsetOf("soon"), "calendar", 9);
		expect(ahead.placeOf("calendar", 9)).toBe(CALENDAR + 1);
	});

	it("keeps a neighbour's turn on the plain line", () => {
		expect(DayLine.plain(2).toward(CALENDAR + 2, "calendar", 3).isPlain(3)).toBe(true);
	});
});

describe("a step as a swipe takes it (the keys ← and →)", () => {
	it("goes Inbox, Soon, the calendar, then a day a step, and back the same way", () => {
		expect(stepped("inbox", 0, 1)).toEqual({ stop: "soon", day: 0 });
		expect(stepped("soon", 0, 1)).toEqual({ stop: "calendar", day: 0 });
		expect(stepped("calendar", 0, 1)).toEqual({ stop: "calendar", day: 1 });
		expect(stepped("calendar", 2, -1)).toEqual({ stop: "calendar", day: 1 });
		expect(stepped("calendar", 0, -1)).toEqual({ stop: "soon", day: 0 });
		expect(stepped("calendar", -1, -1)).toEqual({ stop: "soon", day: 0 });
		expect(stepped("inbox", 0, -1)).toEqual({ stop: "inbox", day: 0 });
	});
});

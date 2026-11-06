import { describe, expect, it } from "vitest";
import { CalendarChoice } from "../../core/application/calendarChoice";
import { CalendarDays } from "../../core/application/calendarDays";
import type { CalendarFile } from "../../core/application/calendarFile";
import type { CalendarEvent, CalendarSource } from "../../core/application/contracts";
import { DayBoundary } from "../../core/domain/DayBoundary";

const NOW = new Date(2026, 9, 31, 0, 30);
const event = (id: string, start: Date, end: Date, allDay = false): CalendarEvent => ({ id, title: id, start, end, allDay, calendar: "Work", color: "#0A84FF", source: "work", account: null, calendarId: null });
const file = (events: CalendarEvent[], from: Date, to: Date): CalendarFile => ({ events, calendars: [{ title: "Work", account: null, calendarId: null, color: null }], exportedAt: NOW, device: null, from, to, validUntil: null });

function days(files: [CalendarSource, CalendarFile][], startHour = 5): CalendarDays {
	return new CalendarDays(new CalendarChoice(new Map(files), [], 60 * 60_000, NOW), new DayBoundary(startHour));
}

describe("CalendarDays", () => {
	const night = event("night", new Date(2026, 9, 31, 1), new Date(2026, 9, 31, 2));
	const morning = event("morning", new Date(2026, 9, 31, 9), new Date(2026, 9, 31, 10));
	const holiday = event("holiday", new Date(2026, 9, 31), new Date(2026, 10, 1), true);
	const work = file([night, morning, holiday], new Date(2026, 9, 30), new Date(2026, 10, 6));

	it("a day starting at 5 shows the timed events from 5 to 5 and the all-day events of its date", () => {
		expect(days([["work", work]]).day("2026-10-30").events.map((e) => e.id)).toEqual(["night"]);
		expect(days([["work", work]]).day("2026-10-31").events.map((e) => e.id)).toEqual(["holiday", "morning"]);
	});

	it("between two instants: the timed events each day shows, once each, by start", () => {
		expect(days([["work", work]]).timedBetween(new Date(2026, 9, 31, 0, 30), new Date(2026, 9, 31, 12)).map((e) => e.id)).toEqual(["night", "morning"]);
	});

	it("before the day's start a calendar comes from the file that covers the day still going", () => {
		const iphone = file([event("phone's night", new Date(2026, 9, 31, 3), new Date(2026, 9, 31, 4))], new Date(2026, 9, 31), new Date(2026, 10, 7));
		const both = days([["iphone", iphone], ["work", work]]);
		expect(both.timedBetween(NOW, new Date(2026, 9, 31, 4, 30)).map((e) => e.id)).toEqual(["night"]);
		expect(days([["iphone", iphone], ["work", work]], 0).timedBetween(NOW, new Date(2026, 9, 31, 4, 30)).map((e) => e.id)).toEqual(["phone's night"]);
	});
});

import { describe, expect, it } from "vitest";
import { PhoneMeetingService } from "../../src/application/PhoneMeetingService";

const file = (events: object[]) => JSON.stringify({ exportedAt: "2026-10-30T08:00:00.000Z", events });
const at = (hour: number) => new Date(2026, 9, 30, hour).toISOString();
const meeting = (title: string, start: number, end: number, calendar = "Work", allDay = false) => ({ id: title, title, start: at(start), end: at(end), allDay, calendar });

describe("PhoneMeetingService", () => {
	it("reads Google's file and the work file at the settings' path", () => {
		expect(new PhoneMeetingService(JSON.stringify({ workCalendarFile: "cal/work.json" })).files()).toEqual(["calendar/google.json", "cal/work.json"]);
		expect(new PhoneMeetingService("").files()).toEqual(["calendar/google.json", "calendar/work.json"]);
	});

	it("gives the timed meetings of both files that overlap the span, by start", () => {
		const google = file([meeting("Lunch", 13, 14, "Personal"), meeting("Birthday", 0, 24, "Family", true)]);
		const work = file([meeting("Standup", 10, 11), meeting("Late", 20, 21)]);
		const meetings = new PhoneMeetingService("").between([google, work], new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 18));
		expect(meetings).toEqual([
			{ title: "Standup", start: new Date(2026, 9, 30, 10), end: new Date(2026, 9, 30, 11) },
			{ title: "Lunch", start: new Date(2026, 9, 30, 13), end: new Date(2026, 9, 30, 14) },
		]);
	});

	it("keeps only the work calendars the settings name, as the calendar does", () => {
		const work = file([meeting("Standup", 10, 11), meeting("Dentist", 12, 13, "Personal")]);
		const meetings = new PhoneMeetingService(JSON.stringify({ workCalendarTitles: ["work"] })).between([null, work], new Date(2026, 9, 30), new Date(2026, 9, 31));
		expect(meetings.map((m) => m.title)).toEqual(["Standup"]);
	});

	it("a missing or broken file adds nothing", () => {
		const work = file([meeting("Standup", 10, 11)]);
		expect(new PhoneMeetingService("").between(["{", work], new Date(2026, 9, 30), new Date(2026, 9, 31)).map((m) => m.title)).toEqual(["Standup"]);
	});
});

import { describe, expect, it } from "vitest";
import { PhoneMeetingService } from "../../src/application/PhoneMeetingService";

const NOW = new Date(2026, 9, 30, 9);
const file = (events: object[]) => JSON.stringify({ exportedAt: "2026-10-30T08:00:00.000Z", events });
const at = (hour: number) => new Date(2026, 9, 30, hour).toISOString();
const meeting = (title: string, start: number, end: number, calendar = "Work", allDay = false) => ({ id: title, title, start: at(start), end: at(end), allDay, calendar });

describe("PhoneMeetingService", () => {
	it("reads Google's file, the app's and the work file at the settings' path", () => {
		expect(new PhoneMeetingService(JSON.stringify({ workCalendarFile: "cal/work.json" })).files()).toEqual(["calendar/google.json", "calendar/iphone.json", "cal/work.json"]);
		expect(new PhoneMeetingService("").files()).toEqual(["calendar/google.json", "calendar/iphone.json", "calendar/work.json"]);
	});

	it("gives the timed meetings of both files that overlap the span, by start", () => {
		const google = file([meeting("Lunch", 13, 14, "Personal"), meeting("Birthday", 0, 24, "Family", true)]);
		const work = file([meeting("Standup", 10, 11), meeting("Late", 20, 21)]);
		const meetings = new PhoneMeetingService("").between([google, null, work], new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 18), NOW);
		expect(meetings).toEqual([
			{ title: "Standup", start: new Date(2026, 9, 30, 10), end: new Date(2026, 9, 30, 11) },
			{ title: "Lunch", start: new Date(2026, 9, 30, 13), end: new Date(2026, 9, 30, 14) },
		]);
	});

	it("keeps only the work calendars the settings name, as the calendar does", () => {
		const work = file([meeting("Standup", 10, 11), meeting("Dentist", 12, 13, "Personal")]);
		const meetings = new PhoneMeetingService(JSON.stringify({ workCalendarTitles: ["work"] })).between([null, null, work], new Date(2026, 9, 30), new Date(2026, 9, 31), NOW);
		expect(meetings.map((m) => m.title)).toEqual(["Standup"]);
	});

	it("a missing or broken file adds nothing", () => {
		const work = file([meeting("Standup", 10, 11)]);
		expect(new PhoneMeetingService("").between(["{", null, work], new Date(2026, 9, 30), new Date(2026, 9, 31), NOW).map((m) => m.title)).toEqual(["Standup"]);
	});
});

describe("PhoneMeetingService, the calendars across the files", () => {
	it("meetings follow the choice and the hidden calendars", () => {
		const exported = new Date().toISOString();
		const personal = (calendarId: string, account: string, title: string) => ({ ...meeting(title, 10, 11, "Personal"), calendarId, account });
		const google = JSON.stringify({ exportedAt: exported, calendars: [{ calendar: "max@gmail.com", account: "max@gmail.com", calendarId: "max@gmail.com" }, { calendar: "Personal", account: "max@gmail.com", calendarId: "p" }], events: [personal("p", "max@gmail.com", "Lunch at 10")] });
		const iphone = JSON.stringify({ exportedAt: exported, calendars: [{ calendar: "max@gmail.com", account: "Gmail", calendarId: "m" }, { calendar: "Personal", account: "Gmail", calendarId: "ek-p" }], events: [personal("ek-p", "Gmail", "Lunch, the phone's copy")] });
		const service = new PhoneMeetingService(JSON.stringify({ calendarsMigrated: true }));
		expect(service.between([google, iphone, null], new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 18), new Date()).map((m) => m.title)).toEqual(["Lunch at 10"]);
		const hidden = new PhoneMeetingService(JSON.stringify({ calendarsMigrated: true, hiddenCalendars: [{ account: "max@gmail.com", title: "Personal" }] }));
		expect(hidden.between([google, iphone, null], new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 18), new Date())).toEqual([]);
	});
});

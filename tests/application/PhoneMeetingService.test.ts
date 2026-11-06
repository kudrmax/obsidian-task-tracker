import { describe, expect, it } from "vitest";
import { readCalendarFile } from "../../src/application/calendarFile";
import { CalendarServiceImpl } from "../../src/application/CalendarServiceImpl";
import type { CalendarSource } from "../../src/application/contracts";
import type { EventFile } from "../../src/application/EventSource";
import { PhoneMeetingService } from "../../src/application/PhoneMeetingService";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { FakeTimers } from "../fakes/FakeTimers";

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

describe("PhoneMeetingService, the day's start", () => {
	// The day starts at 5 (the default). At 00:30 on the 31st the calendar still shows the 30th, and takes the
	// calendar «Work» from the file that covers the 30th: Scriptable's, written yesterday. The phone's own file starts
	// at the 31st, and has the night's meeting moved.
	const exportedAt = new Date(2026, 9, 31, 0, 15).toISOString();
	const night = (title: string, start: number, end: number) => ({ id: title, title, start: new Date(2026, 9, 31, start).toISOString(), end: new Date(2026, 9, 31, end).toISOString(), allDay: false, calendar: "Work" });
	const iphone = JSON.stringify({ exportedAt, from: new Date(2026, 9, 31).toISOString(), to: new Date(2026, 10, 7).toISOString(), calendars: [{ calendar: "Work" }], events: [night("Moved to 3", 3, 4)] });
	const work = JSON.stringify({ exportedAt, from: new Date(2026, 9, 30).toISOString(), to: new Date(2026, 10, 6).toISOString(), calendars: [{ calendar: "Work" }], events: [night("Release at 1", 1, 2)] });
	const now = new Date(2026, 9, 31, 0, 30);
	const settings = { ...DEFAULT_SETTINGS, calendarsMigrated: true };

	it("before the day's start the meetings come from the file the calendar takes them from", () => {
		const meetings = new PhoneMeetingService(JSON.stringify(settings)).between([null, iphone, work], now, new Date(2026, 9, 31, 4, 30), now);
		expect(meetings.map((m) => m.title)).toEqual(["Release at 1"]);
	});

	it("gives the timed meetings the calendar shows, day by day", async () => {
		const read = (source: CalendarSource, text: string): EventFile => ({ name: source, read: async () => readCalendarFile(text, source), onChange: () => () => {} });
		const calendar = new CalendarServiceImpl([read("iphone", iphone), read("work", work)], [], { now: () => now }, new FakeSettingsStore(settings), new FakeTimers(), { export: () => undefined }, { canMigrate: () => false });
		const shown: string[] = [];
		for (const date of ["2026-10-30", "2026-10-31"]) shown.push(...(await calendar.events(date, "refresh").fresh!()).events.map((e) => e.title));
		const phone = new PhoneMeetingService(JSON.stringify(settings)).between([null, iphone, work], new Date(2026, 9, 30), new Date(2026, 10, 1), now);
		expect(phone.map((m) => m.title)).toEqual(shown);
	});
});

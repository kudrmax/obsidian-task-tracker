import { describe, expect, it } from "vitest";
import { calendarFileText, readCalendarFile } from "../../src/application/calendarFile";

const event = (title: string, calendar: string, extra: object = {}) => ({
	id: title,
	title,
	start: "2026-11-05T10:00:00.000Z",
	end: "2026-11-05T11:00:00.000Z",
	allDay: false,
	calendar,
	...extra,
});

describe("readCalendarFile", () => {
	it("reads the window, the calendars and validUntil", () => {
		const file = readCalendarFile(
			JSON.stringify({
				exportedAt: "2026-11-05T09:00:00.000Z",
				device: "iPhone",
				from: "2026-10-05T17:00:00.000Z",
				to: "2027-02-03T17:00:00.000Z",
				validUntil: "2026-11-12T09:44:00.000Z",
				calendars: [{ calendar: "Work", calendarId: "c1", account: "max@company.ru", color: "#0A84FF" }],
				events: [event("Standup", "Work", { calendarId: "c1", account: "max@company.ru" })],
			}),
			"iphone",
		);
		expect(file.from).toEqual(new Date("2026-10-05T17:00:00.000Z"));
		expect(file.to).toEqual(new Date("2027-02-03T17:00:00.000Z"));
		expect(file.validUntil).toEqual(new Date("2026-11-12T09:44:00.000Z"));
		expect(file.calendars[0]).toEqual({ title: "Work", account: "max@company.ru", calendarId: "c1", color: "#0A84FF" });
		expect(file.events[0]).toMatchObject({ source: "iphone", account: "max@company.ru", calendarId: "c1" });
	});

	it("an old file without calendars lists the calendars of its events", () => {
		const file = readCalendarFile(
			JSON.stringify({ exportedAt: "2026-11-05T09:00:00.000Z", events: [event("A", "Work"), event("B", "Work"), event("C", "Home")] }),
			"work",
		);
		expect(file.calendars.map((c) => c.title)).toEqual(["Work", "Home"]);
		expect([file.from, file.to, file.validUntil]).toEqual([null, null, null]);
		expect(file.events.map((e) => [e.account, e.calendarId])).toEqual([
			[null, null],
			[null, null],
			[null, null],
		]);
	});

	it("round-trips through calendarFileText", () => {
		const text = JSON.stringify({
			exportedAt: "2026-11-05T09:00:00.000Z",
			device: "Google",
			from: "2026-10-05T17:00:00.000Z",
			to: "2027-02-03T17:00:00.000Z",
			calendars: [
				{ calendar: "Personal", calendarId: "p", account: "max@gmail.com", color: "#123456" },
				{ calendar: "Empty", calendarId: "e", account: "max@gmail.com", color: null },
			],
			events: [event("Lunch", "Personal", { calendarId: "p", account: "max@gmail.com", color: "#123456" })],
		});
		const file = readCalendarFile(text, "google");
		expect(readCalendarFile(calendarFileText(file), "google")).toEqual(file);
	});
});

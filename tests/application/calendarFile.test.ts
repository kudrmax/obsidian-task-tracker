import { describe, expect, it } from "vitest";
import { calendarFileText, iphoneCalendarAdds, phoneCalendarText, readCalendarFile } from "../../core/application/calendarFile";
import { SourceProblemError } from "../../core/application/EventSource";

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

describe("iphoneCalendarAdds", () => {
	const at = (minute: number, events: object[] = []) =>
		phoneCalendarText({ calendars: [{ title: "Work", calendarId: "w", account: "max@company.ru" }], events: events as never, fromMs: 0, toMs: 1, exportedAtMs: new Date(2026, 10, 4, 9, minute).getTime(), device: "iPhone" });
	const now = (minute: number) => new Date(2026, 10, 4, 9, minute).getTime();

	it("the same calendars are not written again within ten minutes of the last write", () => {
		expect(iphoneCalendarAdds(at(5), at(0), now(5))).toBe(false);
		expect(iphoneCalendarAdds(at(9), at(0), now(9))).toBe(false);
	});

	it("are written again once ten minutes have passed: the file says they are still fresh", () => {
		expect(iphoneCalendarAdds(at(10), at(0), now(10))).toBe(true);
	});

	it("a change is written at once", () => {
		const standup = { id: "s", title: "Standup", startMs: now(30), endMs: now(45), allDay: false, calendarId: "w" };
		expect(iphoneCalendarAdds(at(1, [standup]), at(0), now(1))).toBe(true);
	});

	it("no file, or one that does not read, is written", () => {
		expect(iphoneCalendarAdds(at(1), null, now(1))).toBe(true);
		expect(iphoneCalendarAdds(at(1), "kept", now(1))).toBe(true);
		expect(iphoneCalendarAdds(at(1), JSON.stringify({ device: "iPhone" }), now(1))).toBe(true);
	});
});

describe("readCalendarFile, a file that is no calendar file", () => {
	const problem = (text: string) => {
		try {
			readCalendarFile(text, "work");
		} catch (e) {
			return e instanceof SourceProblemError ? e.problem : `not a SourceProblemError: ${String(e)}`;
		}
		return "read";
	};
	const at = "2026-11-05T09:00:00.000Z";

	it("is unreadable when it is not JSON: cut off, empty, plain text", () => {
		expect(problem('{"exportedAt": "2026-11-05')).toEqual({ kind: "unreadable" });
		expect(problem("")).toEqual({ kind: "unreadable" });
		expect(problem("hello")).toEqual({ kind: "unreadable" });
	});

	it("is unreadable when its JSON has not the file's shape", () => {
		expect(problem("[]")).toEqual({ kind: "unreadable" });
		expect(problem("null")).toEqual({ kind: "unreadable" });
		expect(problem("42")).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ events: [] }))).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ exportedAt: "yesterday", events: [] }))).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ exportedAt: at, events: {} }))).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ exportedAt: at, events: [null] }))).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ exportedAt: at, events: [{ id: "a", title: "A", calendar: "Work" }] }))).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ exportedAt: at, calendars: "Work" }))).toEqual({ kind: "unreadable" });
		expect(problem(JSON.stringify({ exportedAt: at, calendars: [{ title: "Work" }] }))).toEqual({ kind: "unreadable" });
	});

	it("reads a file with no events or calendars as an empty one", () => {
		expect(problem(JSON.stringify({ exportedAt: at }))).toBe("read");
		expect(problem(JSON.stringify({ exportedAt: at, events: [event("A", "Work")] }))).toBe("read");
	});
});

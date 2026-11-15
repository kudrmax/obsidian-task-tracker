import { describe, expect, it } from "vitest";
import type { ScreenView } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext, type WireDayEvents } from "../../core/application/PhoneCalls";

/**
 * What the door is told about its host (`DoorContext.host`, `feedProblems`, `projectsReady`): the plugin answered over
 * the same door as the iPhone app, each left out the app's own behaviour.
 */

const NOW = new Date(2026, 9, 30, 9, 0);
const DAY = "2026-10-30";
type Ok = Extract<DoorAnswer, { ok: true }>;
const ok = (answer: DoorAnswer): Ok => {
	if (!answer.ok) throw new Error(answer.error.message);
	return answer;
};

describe("the host: the old choice of calendars carries over only on iOS", () => {
	const exportedAt = new Date(2026, 9, 30, 8).toISOString();
	const google = JSON.stringify({ exportedAt, calendars: [{ calendar: "Personal", account: "max@gmail.com", calendarId: "p" }], events: [] });
	const iphone = JSON.stringify({ exportedAt, calendars: [{ calendar: "Personal", account: "Gmail", calendarId: "ek-p" }], events: [] });
	const context = (host?: DoorContext["host"]): DoorContext => ({ tasks: null, nowMs: NOW.getTime(), calendars: { google, iphone }, ...(host && { host }) });

	it("carries it over where the host does not say, as the app always did", () => {
		expect(ok(callDoor("calendars.known", [], context())).settings).toContain('"calendarsMigrated": true');
	});

	it("carries it over on iOS", () => {
		expect(ok(callDoor("calendars.known", [], context("ios"))).settings).toContain('"calendarsMigrated": true');
	});

	it("leaves it in Obsidian on a computer: the phone's file there is not this device's", () => {
		expect(ok(callDoor("calendars.known", [], context("obsidian"))).settings).toBeUndefined();
		expect(ok(callDoor("calendars.events", [DAY], context("obsidian"))).settings).toBeUndefined();
	});
});

describe("a feed's problem: Google failing or silent shows on its source as the plugin shows it", () => {
	const exportedAt = new Date(2026, 9, 30, 8, 55).toISOString();
	const google = JSON.stringify({ exportedAt, calendars: [{ calendar: "Personal", account: "max@gmail.com", calendarId: "p" }], events: [] });
	const settings = JSON.stringify({ google: { refreshToken: "a token" } });
	const events = (extra: Partial<DoorContext>) => ok(callDoor("calendars.events", [DAY], { tasks: null, nowMs: NOW.getTime(), settings, calendars: { google }, ...extra })).result as WireDayEvents;
	const googleStatus = (day: WireDayEvents) => day.statuses.find((s) => s.source === "google")!;

	it("is none where the host says none: the file alone decides", () => {
		expect(googleStatus(events({})).problem).toBeNull();
	});

	it("is the feed's when its file reads well: no answer in 15 s", () => {
		const day = events({ feedProblems: { google: { kind: "noAnswer", seconds: 15 } } });
		expect(googleStatus(day).problem).toEqual({ kind: "noAnswer", seconds: 15 });
	});

	it("gives way to the file's own: a file missing says so, whatever the feed did", () => {
		const day = ok(callDoor("calendars.events", [DAY], { tasks: null, nowMs: NOW.getTime(), settings, calendars: {}, feedProblems: { google: { kind: "loggedOut" } } })).result as WireDayEvents;
		expect(googleStatus(day).problem).toEqual({ kind: "fileMissing" });
	});
});

describe("projects ready: the one move to projects waits for the host's notes to be complete", () => {
	const text = "## Inbox\n- [ ] Call 🗂️ [[Acme]]\n- [ ] Other\n";
	const projects = [{ name: "Acme", path: "Clients/Acme.md", link: "Acme" }];
	const read = (projectsReady?: boolean) => ok(callDoor("tasks.screen", [DAY], { tasks: text, nowMs: NOW.getTime(), projects, ...(projectsReady !== undefined && { projectsReady }) }));

	it("runs where the host does not say, as the app always did", () => {
		expect(read().tasks).toContain("## Projects\n\n- Acme [[Acme]]\n");
		expect(read(true).tasks).toContain("## Projects\n\n- Acme [[Acme]]\n");
	});

	it("does not run while the host's notes are incomplete: the file stays as it is", () => {
		const answer = read(false);
		expect(answer.tasks ?? "").not.toContain("## Projects");
		expect((answer.result as ScreenView).inbox.map((i) => i.title)).toHaveLength(2);
	});
});

import { describe, expect, it } from "vitest";
import { readCalendarFile } from "../../src/application/calendarFile";
import type { CalendarEvent } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import { type FeedAdapter, GoogleCalendarFeed } from "../../src/infrastructure/GoogleCalendarFeed";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const PATH = "calendar/google.json";

function meeting(id: string, hour = 10): CalendarEvent {
	return { id, title: id, start: new Date(2026, 9, 30, hour), end: new Date(2026, 9, 30, hour + 1), allDay: false, calendar: "Personal", color: "#123456", source: "google", account: null, calendarId: "personal" };
}

class MemoryAdapter implements FeedAdapter {
	readonly files = new Map<string, string>();
	readonly folders = new Set<string>();
	writes = 0;
	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}
	async read(path: string): Promise<string> {
		return this.files.get(path)!;
	}
	async write(path: string, text: string): Promise<void> {
		this.writes++;
		this.files.set(path, text);
	}
	async mkdir(path: string): Promise<void> {
		this.folders.add(path);
	}
}

class ManualClock implements Clock {
	constructor(public at = new Date(2026, 9, 30, 9, 0)) {}
	now(): Date {
		return this.at;
	}
	pass(ms: number): void {
		this.at = new Date(this.at.getTime() + ms);
	}
}

function feed() {
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, google: { ...DEFAULT_SETTINGS.google, refreshToken: "r", refreshSeconds: 60 } });
	const adapter = new MemoryAdapter();
	const clock = new ManualClock();
	const api = {
		events: [meeting("standup")],
		calendars: [
			{ title: "Personal", account: "max@gmail.com", calendarId: "personal", color: "#123456" },
			{ title: "Empty", account: "max@gmail.com", calendarId: "empty", color: null },
		],
		asked: [] as { start: Date; end: Date }[],
	};
	const google = new GoogleCalendarFeed(
		{
			export: async (start, end) => {
				api.asked.push({ start, end });
				return { account: "max@gmail.com", calendars: api.calendars, events: api.events };
			},
		},
		{ isLoggedIn: () => settings.get().google.refreshToken !== "" },
		adapter,
		settings,
		clock,
	);
	return { google, adapter, clock, api, settings };
}

const written = (adapter: MemoryAdapter) => readCalendarFile(adapter.files.get(PATH)!, "google");

describe("GoogleCalendarFeed", () => {
	it("writes the events of a month back to three months ahead into calendar/google.json", async () => {
		const { google, adapter, api } = feed();
		await google.refresh(true);
		expect(api.asked[0]).toEqual({ start: new Date(2026, 8, 30), end: new Date(2027, 0, 29) });
		expect(adapter.folders.has("calendar")).toBe(true);
		expect(written(adapter)).toMatchObject({ events: [meeting("standup")], exportedAt: new Date(2026, 9, 30, 9), device: "Google" });
	});

	it("writes the window and the calendars, an empty one included", async () => {
		const { google, adapter } = feed();
		await google.refresh(true);
		const file = written(adapter);
		expect([file.from, file.to]).toEqual([new Date(2026, 8, 30), new Date(2027, 0, 29)]);
		expect(file.calendars.map((c) => c.title)).toEqual(["Personal", "Empty"]);
	});

	it("unforced, it does not ask Google again within the refresh interval", async () => {
		const { google, api, clock } = feed();
		await google.refresh(true);
		clock.pass(30_000);
		await google.refresh(false);
		expect(api.asked).toHaveLength(1);
		clock.pass(30_000);
		await google.refresh(false);
		expect(api.asked).toHaveLength(2);
	});

	it("another login is asked at once", async () => {
		const { google, api, settings } = feed();
		await google.refresh(true);
		await settings.update({ google: { ...settings.get().google, refreshToken: "r2" } });
		await google.refresh(false);
		expect(api.asked).toHaveLength(2);
	});

	it("the same events are not written again until ten minutes have passed", async () => {
		const { google, adapter, clock } = feed();
		await google.refresh(true);
		clock.pass(9 * 60_000);
		await google.refresh(true);
		expect(adapter.writes).toBe(1);
		clock.pass(60_000);
		await google.refresh(true);
		expect(adapter.writes).toBe(2);
		expect(written(adapter).exportedAt).toEqual(clock.now());
	});

	it("other events are written at once", async () => {
		const { google, adapter, api } = feed();
		await google.refresh(true);
		api.events = [meeting("standup"), meeting("retro", 15)];
		await google.refresh(true);
		expect(written(adapter).events.map((e) => e.id)).toEqual(["standup", "retro"]);
	});

	it("logged out, it empties the file and says so", async () => {
		const { google, adapter, settings } = feed();
		await google.refresh(true);
		await settings.update({ google: { ...settings.get().google, refreshToken: "" } });
		await expect(google.refresh(true)).rejects.toMatchObject({ problem: { kind: "loggedOut" }, message: "not logged in" });
		expect(written(adapter).events).toEqual([]);
	});

	it("never logged in, it writes no file", async () => {
		const { google, adapter, settings } = feed();
		await settings.update({ google: { ...settings.get().google, refreshToken: "" } });
		await expect(google.refresh(true)).rejects.toThrow("not logged in");
		expect(adapter.files.size).toBe(0);
	});

	it("a failed request leaves the file as it was", async () => {
		const { google, adapter, api } = feed();
		await google.refresh(true);
		const before = adapter.files.get(PATH);
		api.events = null as unknown as CalendarEvent[];
		await expect(google.refresh(true)).rejects.toThrow();
		expect(adapter.files.get(PATH)).toBe(before);
	});
});

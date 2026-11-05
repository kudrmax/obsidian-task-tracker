import { describe, expect, it } from "vitest";
import type { Clock } from "../../src/application/ports";
import { GoogleCalendarApi } from "../../src/infrastructure/GoogleCalendarApi";
import type { HttpRequest, HttpResponse } from "../../src/infrastructure/Http";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const START = new Date(2026, 9, 30, 5);
const END = new Date(2026, 9, 31, 5);

class ManualClock implements Clock {
	private at = new Date(2026, 9, 30, 10).getTime();
	now(): Date {
		return new Date(this.at);
	}
	pass(ms: number): void {
		this.at += ms;
	}
}

function event(id: string) {
	return { id, summary: id, start: { dateTime: "2026-10-30T10:00:00Z" }, end: { dateTime: "2026-10-30T11:00:00Z" } };
}

/** Google over HTTP: one calendar, its events in pages by token; counts the requests of each kind. */
class FakeHttp {
	readonly requests: URL[] = [];
	eventsStatus = 200;
	pages = new Map<string, { items: unknown[]; nextPageToken?: string }>([["", { items: [event("e1")] }]]);

	get lists(): number {
		return this.requests.filter((u) => u.pathname.endsWith("/users/me/calendarList")).length;
	}

	get eventRequests(): URL[] {
		return this.requests.filter((u) => u.pathname.endsWith("/events"));
	}

	readonly http = async (request: HttpRequest): Promise<HttpResponse> => {
		const url = new URL(request.url);
		this.requests.push(url);
		await Promise.resolve();
		if (url.pathname.endsWith("/users/me/calendarList")) return ok({ items: [{ id: "work", summary: "Work", backgroundColor: "#123456" }] });
		if (this.eventsStatus >= 400) return { status: this.eventsStatus, json: null, text: "Not Found" };
		return ok(this.pages.get(url.searchParams.get("pageToken") ?? "") ?? { items: [] });
	};
}

function ok(json: unknown): HttpResponse {
	return { status: 200, json, text: JSON.stringify(json) };
}

function source() {
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, google: { ...DEFAULT_SETTINGS.google, clientId: "id", refreshToken: "r" } });
	const clock = new ManualClock();
	const http = new FakeHttp();
	const auth = { isLoggedIn: () => settings.get().google.refreshToken !== "", accessToken: async () => "a" };
	return { google: new GoogleCalendarApi(auth, settings, clock, http.http), settings, clock, http };
}

describe("GoogleCalendarApi", () => {
	it("asks for the calendar list once for two fetches in a row", async () => {
		const { google, http } = source();
		await google.eventsBetween(START, END);
		await google.eventsBetween(START, END);
		expect(http.lists).toBe(1);
		expect(http.eventRequests).toHaveLength(2);
	});

	it("two fetches at once share one list request", async () => {
		const { google, http } = source();
		await Promise.all([google.eventsBetween(START, END), google.eventsBetween(START, END)]);
		expect(http.lists).toBe(1);
	});

	it("asks for the list again after 30 minutes", async () => {
		const { google, http, clock } = source();
		await google.eventsBetween(START, END);
		clock.pass(30 * 60_000);
		await google.eventsBetween(START, END);
		expect(http.lists).toBe(2);
	});

	it("asks for the list again after another login", async () => {
		const { google, http, settings } = source();
		await google.eventsBetween(START, END);
		await settings.update({ google: { ...settings.get().google, refreshToken: "r2" } });
		await google.eventsBetween(START, END);
		expect(http.lists).toBe(2);
	});

	it("a failed events request drops the list", async () => {
		const { google, http } = source();
		http.eventsStatus = 404;
		await expect(google.eventsBetween(START, END)).rejects.toThrow("404");
		http.eventsStatus = 200;
		await google.eventsBetween(START, END);
		expect(http.lists).toBe(2);
	});

	it("the settings page always asks for the list and refreshes the one kept", async () => {
		const { google, http } = source();
		expect(await google.listCalendars()).toEqual([{ id: "work", title: "Work", color: "#123456" }]);
		await google.eventsBetween(START, END);
		await google.listCalendars();
		expect(http.lists).toBe(2);
	});

	it("follows nextPageToken to the last page", async () => {
		const { google, http } = source();
		http.pages = new Map([
			["", { items: [event("e1")], nextPageToken: "p2" }],
			["p2", { items: [event("e2")] }],
		]);
		const events = await google.eventsBetween(START, END);
		expect(events.map((e) => e.id)).toEqual(["google:work:e1", "google:work:e2"]);
		const [first, second] = http.eventRequests;
		expect(first.searchParams.get("pageToken")).toBeNull();
		expect(second.searchParams.get("pageToken")).toBe("p2");
		expect([first.searchParams.get("maxResults"), second.searchParams.get("maxResults")]).toEqual(["250", "250"]);
	});
});

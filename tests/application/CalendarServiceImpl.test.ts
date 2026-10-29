import { describe, expect, it } from "vitest";
import { CalendarServiceImpl } from "../../src/application/CalendarServiceImpl";
import type { CalendarEvent, CalendarSource } from "../../src/application/contracts";
import type { EventSource } from "../../src/application/EventSource";

const FETCHED = new Date(2026, 9, 30, 8, 0);

function event(source: CalendarSource, id: string, start: Date, end: Date, allDay = false): CalendarEvent {
	return { id, title: id, start, end, allDay, calendar: "Cal", color: "#0A84FF", source };
}

class FakeSource implements EventSource {
	calls: { start: Date; end: Date }[] = [];
	failWith: Error | null = null;

	constructor(
		readonly name: CalendarSource,
		public events: CalendarEvent[] = [],
	) {}

	async eventsBetween(start: Date, end: Date): Promise<{ events: CalendarEvent[]; updatedAt: Date }> {
		this.calls.push({ start, end });
		if (this.failWith) throw this.failWith;
		return { events: this.events, updatedAt: FETCHED };
	}
}

describe("CalendarServiceImpl", () => {
	it("asks every source for the local day and merges the events by start", async () => {
		const google = new FakeSource("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		const svc = new CalendarServiceImpl([google, work]);
		const day = await svc.eventsOn("2026-10-30");
		expect(google.calls[0].start).toEqual(new Date(2026, 9, 30, 0, 0));
		expect(google.calls[0].end).toEqual(new Date(2026, 9, 31, 0, 0));
		expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
		expect(day.statuses).toEqual([
			{ source: "google", ok: true, message: "1 event", updatedAt: FETCHED },
			{ source: "work", ok: true, message: "1 event", updatedAt: FETCHED },
		]);
	});

	it("keeps only the events that touch the day", async () => {
		const work = new FakeSource("work", [
			event("work", "yesterday", new Date(2026, 9, 29, 9), new Date(2026, 9, 29, 10)),
			event("work", "overnight", new Date(2026, 9, 29, 23), new Date(2026, 9, 30, 1)),
			event("work", "today", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10)),
			event("work", "ends at midnight", new Date(2026, 9, 30, 23), new Date(2026, 9, 31, 0)),
			event("work", "tomorrow", new Date(2026, 9, 31, 0), new Date(2026, 9, 31, 1)),
		]);
		const day = await new CalendarServiceImpl([work]).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["overnight", "today", "ends at midnight"]);
		expect(day.statuses[0].message).toBe("3 events");
	});

	it("includes an all-day event when its date falls on the day", async () => {
		const work = new FakeSource("work", [
			event("work", "birthday", new Date(2026, 9, 30), new Date(2026, 9, 31), true),
			event("work", "two days", new Date(2026, 9, 29), new Date(2026, 9, 31), true),
			event("work", "other day", new Date(2026, 9, 31), new Date(2026, 10, 1), true),
			event("work", "zero length", new Date(2026, 9, 30), new Date(2026, 9, 30), true),
		]);
		const day = await new CalendarServiceImpl([work]).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["two days", "birthday", "zero length"]);
	});

	it("a failing source keeps its last good events and reports the error", async () => {
		const google = new FakeSource("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		const svc = new CalendarServiceImpl([google, work]);
		await svc.eventsOn("2026-10-30");
		google.failWith = new Error("Google API 500");
		const day = await svc.eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
		expect(day.statuses[0]).toEqual({ source: "google", ok: false, message: "Google API 500", updatedAt: FETCHED });
		expect(day.statuses[1].ok).toBe(true);
	});

	it("a source that never succeeded reports with no events and no time", async () => {
		const google = new FakeSource("google");
		google.failWith = new Error("not logged in");
		const day = await new CalendarServiceImpl([google]).eventsOn("2026-10-30");
		expect(day.events).toEqual([]);
		expect(day.statuses).toEqual([{ source: "google", ok: false, message: "not logged in", updatedAt: null }]);
	});

	it("reports an empty source as 0 events", async () => {
		const day = await new CalendarServiceImpl([new FakeSource("work")]).eventsOn("2026-10-30");
		expect(day.statuses[0].message).toBe("0 events");
	});
});

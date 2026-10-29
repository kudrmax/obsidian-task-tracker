import { describe, expect, it } from "vitest";
import { CalendarServiceImpl } from "../../src/application/CalendarServiceImpl";
import type { CalendarEvent, CalendarSource } from "../../src/application/contracts";
import type { EventBatch, EventSource } from "../../src/application/EventSource";
import type { Clock } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const FETCHED = new Date(2026, 9, 30, 8, 0);
const NOW = new Date(2026, 9, 30, 9, 0);

function event(source: CalendarSource, id: string, start: Date, end: Date, allDay = false): CalendarEvent {
	return { id, title: id, start, end, allDay, calendar: "Cal", color: "#0A84FF", source };
}

class FakeSource implements EventSource {
	calls: { start: Date; end: Date }[] = [];
	failWith: Error | null = null;
	updatedAt = FETCHED;
	detail: string | undefined;

	constructor(
		readonly name: CalendarSource,
		public events: CalendarEvent[] = [],
	) {}

	async eventsBetween(start: Date, end: Date): Promise<EventBatch> {
		this.calls.push({ start, end });
		if (this.failWith) throw this.failWith;
		return { events: this.events, updatedAt: this.updatedAt, detail: this.detail };
	}
}

class FakeClock implements Clock {
	constructor(public current = NOW) {}
	now(): Date {
		return this.current;
	}
}

function service(sources: EventSource[], clock = new FakeClock(), staleAfterMinutes = DEFAULT_SETTINGS.staleAfterMinutes) {
	return new CalendarServiceImpl(sources, clock, new FakeSettingsStore({ ...DEFAULT_SETTINGS, staleAfterMinutes }));
}

describe("CalendarServiceImpl", () => {
	it("asks every source for the local day and merges the events by start", async () => {
		const google = new FakeSource("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		work.detail = "iPhone";
		const day = await service([google, work]).eventsOn("2026-10-30");
		expect(google.calls[0].start).toEqual(new Date(2026, 9, 30, 0, 0));
		expect(google.calls[0].end).toEqual(new Date(2026, 9, 31, 0, 0));
		expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
		expect(day.statuses).toEqual([
			{ source: "google", ok: true, message: "1 event", updatedAt: FETCHED, detail: null, stale: false },
			{ source: "work", ok: true, message: "1 event", updatedAt: FETCHED, detail: "iPhone", stale: false },
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
		const day = await service([work]).eventsOn("2026-10-30");
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
		const day = await service([work]).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["two days", "birthday", "zero length"]);
	});

	it("a failing source keeps its last good events and reports the error as stale", async () => {
		const google = new FakeSource("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		work.detail = "iPhone";
		const svc = service([google, work]);
		await svc.eventsOn("2026-10-30");
		google.failWith = new Error("Google API 500");
		work.failWith = new Error("file missing");
		const day = await svc.eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
		expect(day.statuses).toEqual([
			{ source: "google", ok: false, message: "Google API 500", updatedAt: FETCHED, detail: null, stale: true },
			{ source: "work", ok: false, message: "file missing", updatedAt: FETCHED, detail: "iPhone", stale: true },
		]);
	});

	it("a source that never succeeded reports with no events and no time", async () => {
		const google = new FakeSource("google");
		google.failWith = new Error("not logged in");
		const day = await service([google]).eventsOn("2026-10-30");
		expect(day.events).toEqual([]);
		expect(day.statuses).toEqual([{ source: "google", ok: false, message: "not logged in", updatedAt: null, detail: null, stale: true }]);
	});

	it("reports an empty source as 0 events", async () => {
		const day = await service([new FakeSource("work")]).eventsOn("2026-10-30");
		expect(day.statuses[0].message).toBe("0 events");
	});

	it("a source older than staleAfterMinutes is stale", async () => {
		const work = new FakeSource("work");
		work.updatedAt = new Date(2026, 9, 30, 5, 0);
		const clock = new FakeClock(new Date(2026, 9, 30, 8, 0));
		expect((await service([work], clock).eventsOn("2026-10-30")).statuses[0].stale).toBe(false);
		clock.current = new Date(2026, 9, 30, 8, 0, 1);
		expect((await service([work], clock).eventsOn("2026-10-30")).statuses[0].stale).toBe(true);
		expect((await service([work], clock, 240).eventsOn("2026-10-30")).statuses[0].stale).toBe(false);
	});

	it("cached returns the last result for the date without fetching", async () => {
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		const svc = service([work]);
		expect(svc.cached("2026-10-30")).toBeNull();
		const day = await svc.eventsOn("2026-10-30");
		expect(svc.cached("2026-10-30")).toBe(day);
		expect(svc.cached("2026-10-31")).toBeNull();
		expect(work.calls).toHaveLength(1);
		const again = await svc.eventsOn("2026-10-30");
		expect(svc.cached("2026-10-30")).toBe(again);
	});
});

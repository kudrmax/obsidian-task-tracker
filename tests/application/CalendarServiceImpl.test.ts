import { describe, expect, it, vi } from "vitest";
import { CalendarServiceImpl } from "../../src/application/CalendarServiceImpl";
import type { CalendarEvent, CalendarSource } from "../../src/application/contracts";
import type { EventBatch, EventSource } from "../../src/application/EventSource";
import type { Clock } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { MemoryEventCache } from "../fakes/MemoryEventCache";

const FETCHED = new Date(2026, 9, 30, 8, 0);
const NOW = new Date(2026, 9, 30, 9, 0);

function event(source: CalendarSource, id: string, start: Date, end: Date, allDay = false): CalendarEvent {
	return { id, title: id, start, end, allDay, calendar: "Cal", color: "#0A84FF", source };
}

class FakeSource implements EventSource {
	calls: { start: Date; end: Date }[] = [];
	failWith: Error | null = null;
	/** The network never answers. */
	silent = false;
	updatedAt = FETCHED;
	detail: string | undefined;

	constructor(
		readonly name: CalendarSource,
		public events: CalendarEvent[] = [],
	) {}

	readonly changeListeners = new Set<() => void>();

	async eventsBetween(start: Date, end: Date): Promise<EventBatch> {
		this.calls.push({ start, end });
		if (this.silent) return new Promise(() => {});
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

function service(sources: EventSource[], clock = new FakeClock(), staleAfterMinutes = DEFAULT_SETTINGS.staleAfterMinutes, cache = new MemoryEventCache(), dayStartHour = 0) {
	return new CalendarServiceImpl(sources, clock, new FakeSettingsStore({ ...DEFAULT_SETTINGS, staleAfterMinutes, dayStartHour }), cache);
}

describe("CalendarServiceImpl", () => {
	it("a day that starts at 4 takes the timed events from 4 to 4 and the all-day events of its date", async () => {
		const google = new FakeSource("google", [
			event("google", "before four", new Date(2026, 9, 30, 2), new Date(2026, 9, 30, 3)),
			event("google", "evening", new Date(2026, 9, 30, 20), new Date(2026, 9, 30, 21)),
			event("google", "after midnight", new Date(2026, 9, 31, 1), new Date(2026, 9, 31, 2)),
			event("google", "all day", new Date(2026, 9, 30), new Date(2026, 9, 31), true),
			event("google", "all next day", new Date(2026, 9, 31), new Date(2026, 10, 1), true),
		]);
		const day = await service([google], new FakeClock(), DEFAULT_SETTINGS.staleAfterMinutes, new MemoryEventCache(), 4).eventsOn("2026-10-30");
		expect(google.calls[0].start).toEqual(new Date(2026, 9, 30, 0, 0));
		expect(google.calls[0].end).toEqual(new Date(2026, 9, 31, 4, 0));
		expect(day.events.map((e) => e.id)).toEqual(["all day", "evening", "after midnight"]);
		expect(day.statuses[0].message).toBe("3 events");
	});

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

	it("a source with no answer in 15 s keeps its last good events, reports stale, and is asked afresh next time", async () => {
		vi.useFakeTimers();
		try {
			const google = new FakeSource("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
			const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
			const svc = service([google, work]);
			await svc.eventsOn("2026-10-30");
			google.silent = true;
			const waiting = svc.eventsOn("2026-10-30");
			await vi.advanceTimersByTimeAsync(14_999);
			let settled = false;
			void waiting.then(() => (settled = true));
			await vi.advanceTimersByTimeAsync(0);
			expect(settled).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			const day = await waiting;
			expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
			expect(day.statuses[0]).toEqual({ source: "google", ok: false, message: "no answer in 15 s", updatedAt: FETCHED, detail: null, stale: true });
			expect(day.statuses[1].ok).toBe(true);
			google.silent = false;
			const next = await svc.eventsOn("2026-10-30");
			expect(google.calls).toHaveLength(3);
			expect(next.statuses[0].ok).toBe(true);
		} finally {
			vi.useRealTimers();
		}
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
		expect(svc.cached("2026-10-30")).toEqual(day);
		expect(svc.cached("2026-10-31")).toBeNull();
		expect(work.calls).toHaveLength(1);
		const again = await svc.eventsOn("2026-10-30");
		expect(svc.cached("2026-10-30")).toEqual(again);
	});

	it("after a restart, cached gives the days the device kept, before any fetch", async () => {
		const cache = new MemoryEventCache();
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		const day = await service([work], new FakeClock(), undefined, cache).eventsOn("2026-10-30");
		const restarted = service([new FakeSource("work")], new FakeClock(), undefined, cache);
		expect(restarted.cached("2026-10-30")).toEqual(day);
	});

	it("a kept day counts its staleness from now", async () => {
		const cache = new MemoryEventCache();
		await service([new FakeSource("work")], new FakeClock(), undefined, cache).eventsOn("2026-10-30");
		const nextDay = new FakeClock(new Date(2026, 9, 31, 9, 0));
		expect(service([], nextDay, undefined, cache).cached("2026-10-30")!.statuses[0].stale).toBe(true);
	});

	it("a source failing after a restart keeps the day's kept events and their time", async () => {
		const cache = new MemoryEventCache();
		const google = new FakeSource("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeSource("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		await service([google, work], new FakeClock(), undefined, cache).eventsOn("2026-10-30");
		google.failWith = new Error("offline");
		work.events = [];
		const day = await service([google, work], new FakeClock(), undefined, cache).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["g1"]);
		expect(day.statuses[0]).toEqual({ source: "google", ok: false, message: "offline", updatedAt: FETCHED, detail: null, stale: true });
	});

	it("keeps the 31 days fetched last", async () => {
		const cache = new MemoryEventCache();
		const svc = service([new FakeSource("work")], new FakeClock(), undefined, cache);
		const october = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
		for (const date of [...october, "2026-11-01"]) await svc.eventsOn(date);
		await svc.eventsOn("2026-10-02");
		expect(cache.days.size).toBe(31);
		expect(cache.days.has("2026-10-01")).toBe(false);
		expect([...cache.days.keys()].pop()).toBe("2026-10-02");
		expect(svc.cached("2026-10-01")).toBeNull();
	});
});

class ChangingSource extends FakeSource {
	onChange(listener: () => void): () => void {
		this.changeListeners.add(listener);
		return () => this.changeListeners.delete(listener);
	}

	change(): void {
		for (const listener of this.changeListeners) listener();
	}
}

describe("CalendarServiceImpl.onChange", () => {
	it("fires when a source says its data changed, and unsubscribes from every source", () => {
		const google = new FakeSource("google");
		const work = new ChangingSource("work");
		const svc = service([google, work]);
		let fired = 0;
		const off = svc.onChange(() => fired++);
		work.change();
		expect(fired).toBe(1);
		off();
		work.change();
		expect(fired).toBe(1);
		expect(work.changeListeners.size).toBe(0);
	});
});

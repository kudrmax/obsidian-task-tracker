import { describe, expect, it, vi } from "vitest";
import type { CalendarFile } from "../../src/application/calendarFile";
import { CalendarServiceImpl } from "../../src/application/CalendarServiceImpl";
import type { CalendarEvent, CalendarSource } from "../../src/application/contracts";
import type { EventFeed, EventFile } from "../../src/application/EventSource";
import type { Clock } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const WRITTEN = new Date(2026, 9, 30, 8, 0);
const NOW = new Date(2026, 9, 30, 9, 0);

function event(source: CalendarSource, id: string, start: Date, end: Date, allDay = false): CalendarEvent {
	return { id, title: id, start, end, allDay, calendar: "Cal", color: "#0A84FF", source };
}

class FakeFile implements EventFile {
	reads = 0;
	failWith: Error | null = null;
	exportedAt = WRITTEN;
	device: string | null = null;
	readonly listeners = new Set<() => void>();

	constructor(
		readonly name: CalendarSource,
		public events: CalendarEvent[] = [],
	) {}

	async read(): Promise<CalendarFile> {
		this.reads++;
		if (this.failWith) throw this.failWith;
		return { events: this.events, exportedAt: this.exportedAt, device: this.device };
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

class FakeFeed implements EventFeed {
	readonly calls: boolean[] = [];
	failWith: Error | null = null;
	/** Never answers. */
	silent = false;

	constructor(
		readonly name: CalendarSource,
		private readonly file?: FakeFile,
		private readonly fetched: CalendarEvent[] = [],
	) {}

	async refresh(force: boolean): Promise<void> {
		this.calls.push(force);
		if (this.silent) return new Promise(() => {});
		if (this.failWith) throw this.failWith;
		if (this.file) this.file.events = this.fetched;
	}
}

class FakeClock implements Clock {
	constructor(public current = NOW) {}
	now(): Date {
		return this.current;
	}
}

function service(files: EventFile[], feeds: EventFeed[] = [], clock = new FakeClock(), dayStartHour = 0) {
	return new CalendarServiceImpl(files, feeds, clock, new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour }));
}

describe("CalendarServiceImpl", () => {
	it("a day that starts at 4 takes the timed events from 4 to 4 and the all-day events of its date", async () => {
		const google = new FakeFile("google", [
			event("google", "before four", new Date(2026, 9, 30, 2), new Date(2026, 9, 30, 3)),
			event("google", "evening", new Date(2026, 9, 30, 20), new Date(2026, 9, 30, 21)),
			event("google", "after midnight", new Date(2026, 9, 31, 1), new Date(2026, 9, 31, 2)),
			event("google", "all day", new Date(2026, 9, 30), new Date(2026, 9, 31), true),
			event("google", "all next day", new Date(2026, 9, 31), new Date(2026, 10, 1), true),
		]);
		const day = await service([google], [], new FakeClock(), 4).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["all day", "evening", "after midnight"]);
		expect(day.statuses[0].message).toBe("3 events");
	});

	it("merges the files' events by start and says where each file came from", async () => {
		const google = new FakeFile("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeFile("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		work.device = "iPhone";
		google.device = "Google";
		const day = await service([google, work], [new FakeFeed("google")]).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
		expect(day.statuses).toEqual([
			{ source: "google", ok: true, message: "1 event", updatedAt: WRITTEN, detail: null, stale: false },
			{ source: "work", ok: true, message: "1 event", updatedAt: WRITTEN, detail: "iPhone", stale: false },
		]);
	});

	it("eventsOn refreshes the feeds, forced, before it reads the files", async () => {
		const file = new FakeFile("google");
		const feed = new FakeFeed("google", file, [event("google", "new", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const day = await service([file], [feed]).eventsOn("2026-10-30");
		expect(feed.calls).toEqual([true]);
		expect(day.events.map((e) => e.id)).toEqual(["new"]);
	});

	it("eventsAround reads the files at once and leaves the feed to run behind, unforced", async () => {
		const file = new FakeFile("google", [event("google", "old", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const feed = new FakeFeed("google");
		feed.silent = true;
		const day = await service([file], [feed]).eventsAround("2026-10-30");
		expect(feed.calls).toEqual([false]);
		expect(day.events.map((e) => e.id)).toEqual(["old"]);
	});

	it("a failed feed keeps the file's events and reports the error as stale", async () => {
		const file = new FakeFile("google", [event("google", "kept", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const feed = new FakeFeed("google", file);
		feed.failWith = new Error("Google API 500");
		const day = await service([file], [feed]).eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["kept"]);
		expect(day.statuses[0]).toEqual({ source: "google", ok: false, message: "Google API 500", updatedAt: WRITTEN, detail: null, stale: true });
	});

	it("a feed that answers again clears its error", async () => {
		const file = new FakeFile("google");
		const feed = new FakeFeed("google", file);
		const calendars = service([file], [feed]);
		feed.failWith = new Error("offline");
		await calendars.eventsOn("2026-10-30");
		feed.failWith = null;
		expect((await calendars.eventsOn("2026-10-30")).statuses[0].ok).toBe(true);
	});

	it("a feed silent for 15 s is reported and the file is still shown", async () => {
		vi.useFakeTimers();
		try {
			const file = new FakeFile("google", [event("google", "kept", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
			const feed = new FakeFeed("google", file);
			feed.silent = true;
			const pending = service([file], [feed]).eventsOn("2026-10-30");
			await vi.advanceTimersByTimeAsync(15_000);
			const day = await pending;
			expect(day.events.map((e) => e.id)).toEqual(["kept"]);
			expect(day.statuses[0].message).toBe("no answer in 15 s");
		} finally {
			vi.useRealTimers();
		}
	});

	it("a file that cannot be read keeps what it showed before and says why", async () => {
		const work = new FakeFile("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		const calendars = service([work]);
		await calendars.eventsOn("2026-10-30");
		work.failWith = new Error("file missing");
		const day = await calendars.eventsOn("2026-10-30");
		expect(day.events.map((e) => e.id)).toEqual(["w1"]);
		expect(day.statuses[0]).toMatchObject({ ok: false, message: "file missing", stale: true });
	});

	it("a file never read reports no events and no time", async () => {
		const work = new FakeFile("work");
		work.failWith = new Error("file missing");
		const day = await service([work]).eventsOn("2026-10-30");
		expect(day.statuses[0]).toEqual({ source: "work", ok: false, message: "file missing", updatedAt: null, detail: null, stale: true });
	});

	it("a file written longer ago than staleAfterMinutes is stale", async () => {
		const work = new FakeFile("work");
		work.exportedAt = new Date(NOW.getTime() - (DEFAULT_SETTINGS.staleAfterMinutes + 1) * 60_000);
		const day = await service([work]).eventsOn("2026-10-30");
		expect(day.statuses[0]).toMatchObject({ ok: true, stale: true });
	});

	it("cached is null before any read, then any day from the files as last read", async () => {
		const work = new FakeFile("work", [event("work", "next day", new Date(2026, 9, 31, 9), new Date(2026, 9, 31, 10))]);
		const calendars = service([work]);
		expect(calendars.cached("2026-10-31")).toBeNull();
		await calendars.eventsOn("2026-10-30");
		expect(calendars.cached("2026-10-31")?.events.map((e) => e.id)).toEqual(["next day"]);
		expect(work.reads).toBe(1);
	});

	it("fires when a file changes, and unsubscribes from every file", () => {
		const google = new FakeFile("google");
		const work = new FakeFile("work");
		let fired = 0;
		const off = service([google, work]).onChange(() => fired++);
		[...google.listeners, ...work.listeners].forEach((listener) => listener());
		expect(fired).toBe(2);
		off();
		expect(google.listeners.size + work.listeners.size).toBe(0);
	});
});

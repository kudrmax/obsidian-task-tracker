import { describe, expect, it } from "vitest";
import type { CalendarFile } from "../../src/application/calendarFile";
import { CalendarServiceImpl } from "../../src/application/CalendarServiceImpl";
import type { CalendarEvent, CalendarSource } from "../../src/application/contracts";
import type { EventFeed, EventFile } from "../../src/application/EventSource";
import type { Clock } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { FakeTimers } from "../fakes/FakeTimers";

const WRITTEN = new Date(2026, 9, 30, 8, 0);
const NOW = new Date(2026, 9, 30, 9, 0);

function event(source: CalendarSource, id: string, start: Date, end: Date, allDay = false): CalendarEvent {
	return { id, title: id, start, end, allDay, calendar: `${source} calendar`, color: "#0A84FF", source, account: null, calendarId: null };
}

class FakeFile implements EventFile {
	reads = 0;
	failWith: Error | null = null;
	exportedAt = WRITTEN;
	device: string | null = null;
	/** The calendars the file lists; none given, those of its events. */
	calendars: CalendarFile["calendars"] | null = null;
	readonly listeners = new Set<() => void>();

	constructor(
		readonly name: CalendarSource,
		public events: CalendarEvent[] = [],
	) {}

	async read(): Promise<CalendarFile> {
		this.reads++;
		if (this.failWith) throw this.failWith;
		const firsts = new Map(this.events.map((e) => [e.calendar, e] as const));
		const calendars = this.calendars ?? [...firsts.values()].map((e) => ({ title: e.calendar, account: e.account, calendarId: e.calendarId, color: null }));
		return { events: this.events, calendars, exportedAt: this.exportedAt, device: this.device, from: null, to: null, validUntil: null };
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

const NO_EXPORT = { export: () => undefined };
const DAY = "2026-10-30";

function service(files: EventFile[], feeds: EventFeed[] = [], clock = new FakeClock(), dayStartHour = 0, settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour }), onPhone = false, timers = new FakeTimers()) {
	return new CalendarServiceImpl(files, feeds, clock, settings, timers, NO_EXPORT, { canMigrate: () => onPhone });
}

const refreshed = (calendars: CalendarServiceImpl, date = DAY) => calendars.events(date, "refresh").fresh!();
const opened = (calendars: CalendarServiceImpl, date = DAY) => calendars.events(date, "open").fresh!();

describe("CalendarServiceImpl", () => {
	it("a day that starts at 4 takes the timed events from 4 to 4 and the all-day events of its date", async () => {
		const google = new FakeFile("google", [
			event("google", "before four", new Date(2026, 9, 30, 2), new Date(2026, 9, 30, 3)),
			event("google", "evening", new Date(2026, 9, 30, 20), new Date(2026, 9, 30, 21)),
			event("google", "after midnight", new Date(2026, 9, 31, 1), new Date(2026, 9, 31, 2)),
			event("google", "all day", new Date(2026, 9, 30), new Date(2026, 9, 31), true),
			event("google", "all next day", new Date(2026, 9, 31), new Date(2026, 10, 1), true),
		]);
		const day = await refreshed(service([google], [], new FakeClock(), 4));
		expect(day.events.map((e) => e.id)).toEqual(["all day", "evening", "after midnight"]);
		expect(day.statuses[0].message).toBe("3 events");
	});

	it("merges the files' events by start and says where each file came from", async () => {
		const google = new FakeFile("google", [event("google", "g1", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const work = new FakeFile("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		work.device = "iPhone";
		google.device = "Google";
		const day = await refreshed(service([google, work], [new FakeFeed("google")]));
		expect(day.events.map((e) => e.id)).toEqual(["w1", "g1"]);
		expect(day.statuses).toEqual([
			{ source: "google", kind: "synced", ok: true, message: "1 event", updatedAt: WRITTEN, detail: null, stale: false },
			{ source: "work", kind: "exported", ok: true, message: "1 event", updatedAt: WRITTEN, detail: "iPhone", stale: false },
		]);
	});

	it("a refresh runs the feeds, forced, before it reads the files", async () => {
		const file = new FakeFile("google");
		const feed = new FakeFeed("google", file, [event("google", "new", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const day = await refreshed(service([file], [feed]));
		expect(feed.calls).toEqual([true]);
		expect(day.events.map((e) => e.id)).toEqual(["new"]);
	});

	it("an opened day reads the files at once and leaves the feed to run behind, unforced", async () => {
		const file = new FakeFile("google", [event("google", "old", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const feed = new FakeFeed("google");
		feed.silent = true;
		const day = await opened(service([file], [feed]));
		expect(feed.calls).toEqual([false]);
		expect(day.events.map((e) => e.id)).toEqual(["old"]);
	});

	it("a failed feed keeps the file's events and reports the error as stale", async () => {
		const file = new FakeFile("google", [event("google", "kept", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const feed = new FakeFeed("google", file);
		feed.failWith = new Error("Google API 500");
		const day = await refreshed(service([file], [feed]));
		expect(day.events.map((e) => e.id)).toEqual(["kept"]);
		expect(day.statuses[0]).toEqual({ source: "google", kind: "synced", ok: false, message: "Google API 500", updatedAt: WRITTEN, detail: null, stale: true });
	});

	it("a feed that answers again clears its error", async () => {
		const file = new FakeFile("google");
		const feed = new FakeFeed("google", file);
		const calendars = service([file], [feed]);
		feed.failWith = new Error("offline");
		await refreshed(calendars);
		feed.failWith = null;
		expect((await refreshed(calendars)).statuses[0].ok).toBe(true);
	});

	it("a feed silent for 15 s is reported and the file is still shown, timed by the service's timers", async () => {
		const file = new FakeFile("google", [event("google", "kept", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const feed = new FakeFeed("google", file);
		feed.silent = true;
		const timers = new FakeTimers();
		const pending = refreshed(service([file], [feed], new FakeClock(), 0, undefined, false, timers));
		await Promise.resolve();
		expect(timers.delays).toEqual([15_000]);
		timers.fire();
		const day = await pending;
		expect(day.events.map((e) => e.id)).toEqual(["kept"]);
		expect(day.statuses[0].message).toBe("no answer in 15 s");
	});

	it("a feed that answers clears its timer", async () => {
		const timers = new FakeTimers();
		await refreshed(service([new FakeFile("google")], [new FakeFeed("google")], new FakeClock(), 0, undefined, false, timers));
		expect(timers.delays).toEqual([]);
	});

	it("a file that cannot be read keeps what it showed before and says why", async () => {
		const work = new FakeFile("work", [event("work", "w1", new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10))]);
		const calendars = service([work]);
		await refreshed(calendars);
		work.failWith = new Error("file missing");
		const day = await refreshed(calendars);
		expect(day.events.map((e) => e.id)).toEqual(["w1"]);
		expect(day.statuses[0]).toMatchObject({ ok: false, message: "file missing", stale: true });
	});

	it("a file never read reports no events and no time", async () => {
		const work = new FakeFile("work");
		work.failWith = new Error("file missing");
		const day = await refreshed(service([work]));
		expect(day.statuses[0]).toEqual({ source: "work", kind: "exported", ok: false, message: "file missing", updatedAt: null, detail: null, stale: true });
	});

	it("a file written longer ago than staleAfterMinutes is stale", async () => {
		const work = new FakeFile("work");
		work.exportedAt = new Date(NOW.getTime() - (DEFAULT_SETTINGS.staleAfterMinutes + 1) * 60_000);
		const day = await refreshed(service([work]));
		expect(day.statuses[0]).toMatchObject({ ok: true, stale: true });
	});

	it("nothing is cached before the first read, then any day comes from the files as last read", async () => {
		const work = new FakeFile("work", [event("work", "next day", new Date(2026, 9, 31, 9), new Date(2026, 9, 31, 10))]);
		const calendars = service([work]);
		expect(calendars.events("2026-10-31", "open").cached).toBeNull();
		await refreshed(calendars);
		expect(calendars.events("2026-10-31", "open").cached?.events.map((e) => e.id)).toEqual(["next day"]);
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

describe("CalendarServiceImpl.events", () => {
	it("asks nothing until the fresh events are asked for", () => {
		const file = new FakeFile("google");
		const feed = new FakeFeed("google");
		const calendars = service([file], [feed]);
		for (const reason of ["open", "peek", "refresh"] as const) calendars.events(DAY, reason);
		expect([file.reads, feed.calls.length]).toEqual([0, 0]);
	});

	it("a peek at a day once the files were read asks nothing; before that it reads them", async () => {
		const file = new FakeFile("google", [event("google", "g", new Date(2026, 9, 30, 12), new Date(2026, 9, 30, 13))]);
		const calendars = service([file], [new FakeFeed("google")]);
		const first = calendars.events(DAY, "peek");
		expect(first.cached).toBeNull();
		await first.fresh!();
		const again = calendars.events("2026-10-31", "peek");
		expect(again.fresh).toBeNull();
		expect(calendars.events(DAY, "peek").cached!.events.map((e) => e.id)).toEqual(["g"]);
		expect(file.reads).toBe(1);
	});

	it("tells each source's kind, cached and fresh", async () => {
		const calendars = service([new FakeFile("google"), new FakeFile("work")], [new FakeFeed("google")]);
		const fresh = await refreshed(calendars);
		expect(fresh.statuses.map((s) => [s.source, s.kind])).toEqual([["google", "synced"], ["work", "exported"]]);
		expect(calendars.events(DAY, "open").cached!.statuses.map((s) => s.kind)).toEqual(["synced", "exported"]);
	});
});

describe("CalendarServiceImpl.keepFresh", () => {
	function polled(refreshSeconds = 60) {
		const timers = new FakeTimers();
		const clock = new FakeClock();
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, google: { ...DEFAULT_SETTINGS.google, refreshSeconds } });
		const order: string[] = [];
		let hidden = false;
		const calendars = new CalendarServiceImpl([], [], clock, settings, timers, { export: () => order.push("export") }, { canMigrate: () => false });
		const poll = calendars.keepFresh({
			refresh: async () => {
				order.push("fetch");
			},
			hidden: () => hidden,
		});
		return { poll, timers, clock, settings, order, setHidden: (h: boolean) => (hidden = h) };
	}

	it("starts at once with the refresh interval of the settings, read afresh at every tick", async () => {
		const t = polled(60);
		expect(t.timers.delays).toEqual([60_000]);
		await t.settings.update({ google: { ...DEFAULT_SETTINGS.google, refreshSeconds: 30 } });
		t.timers.fire();
		expect(t.order).toEqual(["fetch"]);
		expect(t.timers.delays).toEqual([30_000]);
	});

	it("fetches nothing for a screen off view and catches up when it is back", () => {
		const t = polled();
		t.setHidden(true);
		t.timers.fire();
		expect(t.order).toEqual([]);
		t.setHidden(false);
		t.poll.catchUp();
		expect(t.order).toEqual(["fetch"]);
	});

	it("wakes by the service's clock: under half an interval since the last fetch, nothing", () => {
		const t = polled(60);
		t.clock.current = new Date(t.clock.current.getTime() + 29_000);
		t.poll.wake();
		expect(t.order).toEqual([]);
		t.clock.current = new Date(t.clock.current.getTime() + 2_000);
		t.poll.wake();
		expect(t.order).toEqual(["fetch"]);
	});

	it("Refresh now asks the phone for work events first, then fetches", async () => {
		const t = polled();
		await t.poll.refreshNow();
		expect(t.order).toEqual(["export", "fetch"]);
	});

	it("leaves no timer once stopped", () => {
		const t = polled();
		t.poll.stop();
		expect(t.timers.delays).toEqual([]);
	});
});

describe("CalendarServiceImpl, the calendars across the files", () => {
	const GMAIL = "max@gmail.com";
	const work = (source: CalendarSource, title: string, hour: number): CalendarEvent => ({
		...event(source, title, new Date(2026, 9, 30, hour), new Date(2026, 9, 30, hour + 1)),
		calendar: "Work",
		account: source === "iphone" ? "max@company.ru" : null,
		calendarId: "ek-work",
	});
	const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

	it("the dot follows the shown calendars, not every writer", async () => {
		const iphone = new FakeFile("iphone", [work("iphone", "from the app", 10)]);
		iphone.exportedAt = minutesAgo(300);
		const scriptable = new FakeFile("work", [work("work", "from Scriptable", 11)]);
		scriptable.exportedAt = minutesAgo(1);
		const day = await refreshed(service([iphone, scriptable]));
		expect(day.events.map((e) => e.title)).toEqual(["from Scriptable"]);
		expect(day.stale).toBe(false);
		expect(day.statuses.find((s) => s.source === "iphone")?.stale).toBe(true);
	});

	it("a day whose shown calendar has only stale files is stale", async () => {
		const iphone = new FakeFile("iphone", [work("iphone", "from the app", 10)]);
		iphone.exportedAt = minutesAgo(300);
		expect((await refreshed(service([iphone]))).stale).toBe(true);
	});

	it("hidden calendars stay out", async () => {
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour: 0, calendarsMigrated: true, hiddenCalendars: [{ account: "max@company.ru", title: "Work" }] });
		const day = await refreshed(service([new FakeFile("iphone", [work("iphone", "hidden", 10)])], [], new FakeClock(), 0, settings));
		expect(day.events).toEqual([]);
	});

	it("known lists every calendar with whether it is shown, and setShown hides it", async () => {
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, calendarsMigrated: true });
		const calendars = service([new FakeFile("iphone", [work("iphone", "w", 10)])], [], new FakeClock(), 0, settings);
		expect(await calendars.known()).toEqual([{ account: "max@company.ru", title: "Work", color: null, shown: true }]);
		await calendars.setShown("max@company.ru", "Work", false);
		expect(settings.get().hiddenCalendars).toEqual([{ account: "max@company.ru", title: "Work" }]);
		expect((await calendars.known())[0].shown).toBe(false);
	});

	function migrating(onPhone: boolean) {
		const google = new FakeFile("google");
		google.calendars = [
			{ title: GMAIL, account: GMAIL, calendarId: GMAIL, color: null },
			{ title: "Personal", account: GMAIL, calendarId: "personal", color: null },
		];
		const iphone = new FakeFile("iphone");
		iphone.calendars = [{ title: GMAIL, account: "Gmail", calendarId: "ek-main", color: null }];
		const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, google: { ...DEFAULT_SETTINGS.google, calendarIds: ["personal"] } });
		return { settings, calendars: service([google, iphone], [], new FakeClock(), 0, settings, onPhone) };
	}

	it("the phone does not carry over from a Google file written before phase 2", async () => {
		const phone = migrating(true);
		const files = (phone.calendars as unknown as { files: FakeFile[] }).files;
		files[0].calendars = files[0].calendars!.map((c) => ({ ...c, calendarId: null, account: null }));
		await refreshed(phone.calendars);
		expect(phone.settings.get().calendarsMigrated).toBe(false);
	});

	it("before the carry-over the old choice applies, and the phone carries it over once", async () => {
		const elsewhere = migrating(false);
		await refreshed(elsewhere.calendars);
		expect(elsewhere.settings.get().calendarsMigrated).toBe(false);
		expect((await elsewhere.calendars.known()).map((c) => [c.title, c.shown])).toEqual([
			[GMAIL, false],
			["Personal", true],
		]);
		const phone = migrating(true);
		await refreshed(phone.calendars);
		expect(phone.settings.get()).toMatchObject({ calendarsMigrated: true, hiddenCalendars: [{ account: GMAIL, title: GMAIL }] });
	});
});

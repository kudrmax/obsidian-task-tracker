import { describe, expect, it } from "vitest";
import type { DayChange } from "../../src/application/contracts";
import { DayServiceImpl } from "../../src/application/DayServiceImpl";
import type { Clock, Ticker } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

class MovingClock implements Clock {
	constructor(public at: Date) {}

	now(): Date {
		return new Date(this.at);
	}
}

/** The minute's tick, run by hand. */
class HandTicker implements Ticker {
	ticks: (() => void)[] = [];
	every(ms: number, tick: () => void): () => void {
		expect(ms).toBe(60_000);
		this.ticks.push(tick);
		return () => {
			this.ticks = this.ticks.filter((t) => t !== tick);
		};
	}

	async tick(): Promise<void> {
		for (const tick of this.ticks) tick();
		await Promise.resolve();
		await Promise.resolve();
	}
}

function setUp(at: Date, dayStartHour = 0) {
	const clock = new MovingClock(at);
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour });
	const ticker = new HandTicker();
	const log: string[] = [];
	const tasks = { normalize: async () => void log.push("normalize") };
	const days = new DayServiceImpl(clock, settings, tasks, ticker);
	const listen = (ready?: () => boolean) => days.onDayChange((change: DayChange) => log.push(change), ready);
	return { clock, settings, ticker, log, days, listen };
}

describe("DayServiceImpl", () => {
	it("tells how a day stands to today by the hour the day starts at", () => {
		const { days } = setUp(new Date(2026, 10, 5, 3, 30), 4);
		expect(days.relation("2026-11-04")).toBe("today");
		expect(days.relation("2026-11-05")).toBe("tomorrow");
		expect(days.relation("2026-11-03")).toBe("yesterday");
		expect(days.relation("2026-11-06")).toBe("other");
	});

	it("opens today's timeline on the now line, another day's at the hour the settings name, both from the day's start", () => {
		const { days } = setUp(new Date(2026, 10, 5, 3, 30), 4);
		expect(days.openAt("2026-11-04")).toEqual({ kind: "now", minute: 23 * 60 + 30 });
		expect(days.openAt("2026-11-05")).toEqual({ kind: "hour", minute: 5 * 60 });
		expect(days.openAt("2026-10-30")).toEqual({ kind: "hour", minute: 5 * 60 });
	});

	it("steps days on and back, across months and years", () => {
		const { days } = setUp(new Date(2026, 10, 5, 12, 0));
		expect(days.step("2026-11-30", 1)).toBe("2026-12-01");
		expect(days.step("2027-01-01", -1)).toBe("2026-12-31");
		expect(days.step("2026-11-05", 7)).toBe("2026-11-12");
	});

	it("today and the day's boundary follow the clock and the hour the day starts at", async () => {
		const { days, settings } = setUp(new Date(2026, 10, 5, 3, 30), 4);
		expect(days.today()).toBe("2026-11-04");
		expect(days.boundary().startHour).toBe(4);
		await settings.update({ dayStartHour: 0 });
		expect(days.today()).toBe("2026-11-05");
		expect(days.boundary().startHour).toBe(0);
	});

	it("at midnight the minute's check normalizes the tasks once, then tells the day passed", async () => {
		const { clock, ticker, log, listen } = setUp(new Date(2026, 10, 5, 23, 59));
		listen();
		await ticker.tick();
		expect(log).toEqual([]);
		clock.at = new Date(2026, 10, 6, 0, 0);
		await ticker.tick();
		await ticker.tick();
		expect(log).toEqual(["normalize", "passed"]);
	});

	it("a day that starts at 4 passes at 4, not at midnight", async () => {
		const { clock, ticker, log, listen } = setUp(new Date(2026, 10, 5, 23, 59), 4);
		listen();
		clock.at = new Date(2026, 10, 6, 0, 0);
		await ticker.tick();
		clock.at = new Date(2026, 10, 6, 3, 59);
		await ticker.tick();
		expect(log).toEqual([]);
		clock.at = new Date(2026, 10, 6, 4, 0);
		await ticker.tick();
		expect(log).toEqual(["normalize", "passed"]);
	});

	it("waits while a listener is not ready and catches up once, when it is", async () => {
		const { clock, ticker, log, listen, days } = setUp(new Date(2026, 10, 5, 23, 59));
		let ready = false;
		listen(() => ready);
		clock.at = new Date(2026, 10, 6, 0, 1);
		await ticker.tick();
		days.catchUp();
		await Promise.resolve();
		expect(log).toEqual([]);
		ready = true;
		days.catchUp();
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toEqual(["normalize", "passed"]);
		days.catchUp();
		await Promise.resolve();
		expect(log).toEqual(["normalize", "passed"]);
	});

	it("a catch-up with no minute missed checks nothing, even on a new day", async () => {
		const { clock, log, listen, days } = setUp(new Date(2026, 10, 5, 23, 59));
		listen();
		clock.at = new Date(2026, 10, 6, 0, 1);
		days.catchUp();
		await Promise.resolve();
		expect(log).toEqual([]);
	});

	it("another hour for the day's start tells the day moved, without normalizing, and the next minute of that day tells nothing", async () => {
		const { settings, ticker, log, listen } = setUp(new Date(2026, 10, 6, 4, 30), 4);
		listen(() => false);
		await settings.update({ longPressMs: 400 });
		expect(log).toEqual([]);
		await settings.update({ dayStartHour: 5 });
		expect(log).toEqual(["moved"]);
		await settings.update({ dayStartHour: 3 });
		expect(log).toEqual(["moved", "moved"]);
		await ticker.tick();
		expect(log).toEqual(["moved", "moved"]);
	});

	it("the last listener gone stops the minute's check and the settings' watch; the next one starts them afresh", async () => {
		const { clock, settings, ticker, log, listen } = setUp(new Date(2026, 10, 5, 23, 59));
		const offA = listen();
		const offB = listen();
		expect(ticker.ticks).toHaveLength(1);
		offA();
		expect(ticker.ticks).toHaveLength(1);
		offB();
		offB();
		expect(ticker.ticks).toHaveLength(0);
		await settings.update({ dayStartHour: 5 });
		expect(log).toEqual([]);
		clock.at = new Date(2026, 10, 6, 6, 0);
		listen();
		await ticker.tick();
		expect(log).toEqual([]);
	});
});

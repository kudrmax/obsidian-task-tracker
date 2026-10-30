import { describe, expect, it } from "vitest";
import type { DayEvents } from "../../src/application/contracts";
import { type DeviceStorage, DeviceEventCache } from "../../src/infrastructure/DeviceEventCache";

class FakeStorage implements DeviceStorage {
	readonly saved = new Map<string, unknown>();

	loadLocalStorage(key: string): unknown {
		return this.saved.get(key) ?? null;
	}

	saveLocalStorage(key: string, data: unknown): void {
		this.saved.set(key, JSON.parse(JSON.stringify(data)));
	}
}

const DAY: DayEvents = {
	events: [
		{ id: "1", title: "Standup", start: new Date(2026, 9, 30, 9), end: new Date(2026, 9, 30, 9, 15), allDay: false, calendar: "Work", color: "#0A84FF", source: "work" },
	],
	statuses: [
		{ source: "google", ok: false, message: "not logged in", updatedAt: null, detail: null, stale: true },
		{ source: "work", ok: true, message: "1 event", updatedAt: new Date(2026, 9, 30, 8, 2), detail: "iPhone", stale: false },
	],
};

describe("DeviceEventCache", () => {
	it("gives back the days it was given, dates as dates, in their order", () => {
		const storage = new FakeStorage();
		new DeviceEventCache(storage).write(new Map([["2026-10-31", DAY], ["2026-10-30", DAY]]));
		const read = new DeviceEventCache(storage).read();
		expect([...read.keys()]).toEqual(["2026-10-31", "2026-10-30"]);
		expect(read.get("2026-10-30")).toEqual(DAY);
	});

	it("reads as empty when nothing or something unknown is stored", () => {
		const storage = new FakeStorage();
		expect(new DeviceEventCache(storage).read().size).toBe(0);
		storage.saved.set("task-calendar:events", { version: 0, days: [] });
		expect(new DeviceEventCache(storage).read().size).toBe(0);
		storage.saved.set("task-calendar:events", { version: 1, days: [["2026-10-30", null]] });
		expect(new DeviceEventCache(storage).read().size).toBe(0);
	});

	it("drops an event whose date does not read", () => {
		const storage = new FakeStorage();
		const day = { events: [{ ...DAY.events[0], start: "soon", end: "later" }], statuses: [] };
		storage.saved.set("task-calendar:events", { version: 1, days: [["2026-10-30", day]] });
		expect(new DeviceEventCache(storage).read().get("2026-10-30")!.events).toEqual([]);
	});
});

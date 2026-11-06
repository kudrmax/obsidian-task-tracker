import { describe, expect, it } from "vitest";
import type { PathWatcher } from "../../src/infrastructure/VaultPathWatcher";
import { CalendarFileSource } from "../../src/infrastructure/CalendarFileSource";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const FILE = JSON.stringify({
	exportedAt: "2026-10-30T08:00:00.000Z",
	device: "iPhone",
	events: [
		{ id: "1", title: "Standup", start: "2026-10-30T07:00:00.000Z", end: "2026-10-30T07:15:00.000Z", allDay: false, calendar: "Work", color: "#FF0000", location: null },
		{ id: "2", title: "Dentist", start: "2026-10-30T10:00:00.000Z", end: "2026-10-30T11:00:00.000Z", allDay: false, calendar: "Personal", color: null, location: "Clinic" },
		{ id: "3", title: "Holiday", start: "2026-10-30T00:00:00.000Z", end: "2026-10-31T00:00:00.000Z", allDay: true, calendar: "Holidays" },
	],
});

class FakeAdapter {
	reads = 0;
	readonly mtimes: Record<string, number> = {};
	constructor(readonly files: Record<string, string>) {}
	async stat(path: string): Promise<{ mtime: number; size: number } | null> {
		if (!(path in this.files)) return null;
		return { mtime: this.mtimes[path] ?? 1, size: this.files[path].length };
	}
	async read(path: string): Promise<string> {
		this.reads++;
		return this.files[path];
	}
}

class FakeWatcher implements PathWatcher {
	readonly watched: { path: () => string; listener: () => void }[] = [];

	watch(path: () => string, listener: () => void): () => void {
		const entry = { path, listener };
		this.watched.push(entry);
		return () => this.watched.splice(this.watched.indexOf(entry), 1);
	}
}

function source(titles: string[] = [], path = "calendar/work.json", watcher = new FakeWatcher()) {
	return counted(titles, path, watcher).work;
}

function counted(titles: string[] = [], path = "calendar/work.json", watcher = new FakeWatcher()) {
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, workCalendarFile: path, workCalendarTitles: titles });
	const adapter = new FakeAdapter({ "calendar/work.json": FILE });
	const work = new CalendarFileSource("work", () => settings.get().workCalendarFile, adapter, watcher);
	return { work, adapter, settings };
}

describe("CalendarFileSource", () => {
	it("is the work source", () => {
		expect(source().name).toBe("work");
	});

	it("says it changed when the file at the configured path changes", () => {
		const watcher = new FakeWatcher();
		const work = source([], "calendar/work.json", watcher);
		let fired = 0;
		const off = work.onChange(() => fired++);
		expect(watcher.watched.map((w) => w.path())).toEqual(["calendar/work.json"]);
		watcher.watched[0].listener();
		expect(fired).toBe(1);
		off();
		expect(watcher.watched).toEqual([]);
	});

	it("reads every event when no titles are configured", async () => {
		const { events, exportedAt, device } = await source().read();
		expect(events.map((e) => e.title)).toEqual(["Standup", "Dentist", "Holiday"]);
		expect(exportedAt).toEqual(new Date("2026-10-30T08:00:00.000Z"));
		expect(device).toBe("iPhone");
	});

	it("maps the fields, with the default color when the file has none", async () => {
		const { events } = await source().read();
		expect(events[0]).toEqual({
			id: "1",
			title: "Standup",
			start: new Date("2026-10-30T07:00:00.000Z"),
			end: new Date("2026-10-30T07:15:00.000Z"),
			allDay: false,
			calendar: "Work",
			color: "#FF0000",
			source: "work",
			account: null,
			calendarId: null,
		});
		expect(events[1].color).toBe("#0A84FF");
		expect(events[2]).toMatchObject({ allDay: true, color: "#0A84FF" });
	});

	it("throws 'file missing' when the file is not there", async () => {
		await expect(source([], "calendar/other.json").read()).rejects.toMatchObject({ problem: { kind: "fileMissing" }, message: "file missing" });
	});

	it("reads and parses the file once while it stays the same", async () => {
		const { work, adapter } = counted();
		await work.read();
		await work.read();
		const { events } = await work.read();
		expect(adapter.reads).toBe(1);
		expect(events).toHaveLength(3);
	});

	it("reads it again when its time or size changed", async () => {
		const { work, adapter } = counted();
		await work.read();
		adapter.mtimes["calendar/work.json"] = 2;
		await work.read();
		expect(adapter.reads).toBe(2);
		adapter.files["calendar/work.json"] = JSON.stringify({ exportedAt: "2026-10-30T09:00:00.000Z", events: [] });
		const { events } = await work.read();
		expect(adapter.reads).toBe(3);
		expect(events).toEqual([]);
	});

	it("reads the new file when the path in the settings changed", async () => {
		const { work, adapter, settings } = counted();
		await work.read();
		adapter.files["calendar/other.json"] = JSON.stringify({ exportedAt: "2026-10-30T09:00:00.000Z", events: [] });
		await settings.update({ workCalendarFile: "calendar/other.json" });
		const { events } = await work.read();
		expect(adapter.reads).toBe(2);
		expect(events).toEqual([]);
	});

	it("a file that does not parse is read again next time", async () => {
		const { work, adapter } = counted();
		adapter.files["calendar/work.json"] = "{";
		await expect(work.read()).rejects.toThrow();
		await expect(work.read()).rejects.toThrow();
		expect(adapter.reads).toBe(2);
	});
});

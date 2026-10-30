import { describe, expect, it } from "vitest";
import type { PathWatcher } from "../../src/infrastructure/VaultPathWatcher";
import { WorkCalendarFileSource } from "../../src/infrastructure/WorkCalendarFileSource";
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
	constructor(private readonly files: Record<string, string>) {}
	async exists(path: string): Promise<boolean> {
		return path in this.files;
	}
	async read(path: string): Promise<string> {
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
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, workCalendarFile: path, workCalendarTitles: titles });
	return new WorkCalendarFileSource(new FakeAdapter({ "calendar/work.json": FILE }), settings, watcher);
}

describe("WorkCalendarFileSource", () => {
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
		const { events, updatedAt, detail } = await source().eventsBetween();
		expect(events.map((e) => e.title)).toEqual(["Standup", "Dentist", "Holiday"]);
		expect(updatedAt).toEqual(new Date("2026-10-30T08:00:00.000Z"));
		expect(detail).toBe("iPhone");
	});

	it("maps the fields, with the default color when the file has none", async () => {
		const { events } = await source().eventsBetween();
		expect(events[0]).toEqual({
			id: "1",
			title: "Standup",
			start: new Date("2026-10-30T07:00:00.000Z"),
			end: new Date("2026-10-30T07:15:00.000Z"),
			allDay: false,
			calendar: "Work",
			color: "#FF0000",
			source: "work",
		});
		expect(events[1].color).toBe("#0A84FF");
		expect(events[2]).toMatchObject({ allDay: true, color: "#0A84FF" });
	});

	it("filters by calendar title, ignoring case and blanks", async () => {
		const { events } = await source(["work", " HOLIDAYS ", ""]).eventsBetween();
		expect(events.map((e) => e.title)).toEqual(["Standup", "Holiday"]);
	});

	it("throws 'file missing' when the file is not there", async () => {
		await expect(source([], "calendar/other.json").eventsBetween()).rejects.toThrow("file missing");
	});
});

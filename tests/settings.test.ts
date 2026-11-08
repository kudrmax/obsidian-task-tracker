import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, settingsFrom } from "../core/settings";
import { storedSettingsFrom } from "../obsidian/settingsFile";

describe("settingsFrom", () => {
	it("returns the defaults for nothing saved", () => {
		expect(settingsFrom(null)).toEqual(DEFAULT_SETTINGS);
	});

	it("marks alarms with 🚨 and no reminder with 🔕 unless set", () => {
		expect(settingsFrom(null)).toMatchObject({ slotMarker: "⏰", alarmSlotMarker: "🚨", liveSlotMarker: "📌", silentSlotMarker: "🔕" });
	});

	it("shows every calendar and has carried nothing over unless set", () => {
		expect(settingsFrom({ workCalendarTitles: ["Work"] })).toMatchObject({ hiddenCalendars: [], calendarsMigrated: false });
	});

	it("starts the day at 5 unless set", () => {
		expect(settingsFrom(null).dayStartHour).toBe(5);
		expect(settingsFrom({ dayStartHour: 4 }).dayStartHour).toBe(4);
	});

	it("draws cards 35 px high, 2 px apart, unless set, within their bounds: every frontend's alike", () => {
		expect(settingsFrom(null)).toMatchObject({ cardHeight: 35, cardGap: 2 });
		expect(settingsFrom({ cardHeight: 30, cardGap: 0 })).toMatchObject({ cardHeight: 30, cardGap: 0 });
		expect(settingsFrom({ cardHeight: 99, cardGap: -3 })).toMatchObject({ cardHeight: 40, cardGap: 0 });
		expect(settingsFrom({ cardHeight: "tall", cardGap: 3.6 })).toMatchObject({ cardHeight: 35, cardGap: 4 });
		expect(storedSettingsFrom({ cardHeight: 30 })).toMatchObject({ cardHeight: 30, cardGap: 2, dayStartHour: 5 });
	});

	it("hold nothing of how a frontend lays out its screen", () => {
		for (const key of ["listShare", "rightMode", "zoom"]) expect(key in DEFAULT_SETTINGS).toBe(false);
	});

	it("zoom the timeline by 28, 56, 112 and 224 unless levels that read are saved: every frontend's alike", () => {
		expect(settingsFrom(null).zoomLevels).toEqual([{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }]);
		expect(settingsFrom({ zoomLevels: [{ hourPx: 40 }, { hourPx: 80 }] }).zoomLevels).toEqual([{ hourPx: 40 }, { hourPx: 80 }]);
		expect(settingsFrom({ zoomLevels: [{ hourPx: 40, minutes: 15 }] }).zoomLevels).toEqual([{ hourPx: 40 }]);
		for (const zoomLevels of [[], [{ hourPx: -1 }], "28, 56", [{ hourPx: "40" }]]) expect(settingsFrom({ zoomLevels }).zoomLevels).toEqual(DEFAULT_SETTINGS.zoomLevels);
		expect(storedSettingsFrom({ zoomLevels: [{ hourPx: 40 }] }).zoomLevels).toEqual([{ hourPx: 40 }]);
	});

	it("paint a card of several labels in stripes unless blend is saved", () => {
		expect(settingsFrom(null).labelPaint).toBe("stripes");
		expect(settingsFrom({ labelPaint: "blend" }).labelPaint).toBe("blend");
		expect(settingsFrom({ labelPaint: "plaid" }).labelPaint).toBe("stripes");
		expect(storedSettingsFrom({ labelPaint: "blend" }).labelPaint).toBe("blend");
	});

	it("keeps the other nested keys when one is saved", () => {
		const s = settingsFrom({ google: { clientId: "id" }, sections: { now: "Today" } });
		expect(s.google.clientId).toBe("id");
		expect(s.google.refreshSeconds).toBe(60);
		expect(s.sections.now).toBe("Today");
		expect(s.sections.done).toBe("Done");
	});
});

describe("groups", () => {
	it("merges saved groups over the defaults", () => {
		expect(settingsFrom({}).groups).toEqual({ presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" });
		const s = settingsFrom({ groups: { ungrouped: "Без секции" } });
		expect(s.groups.ungrouped).toBe("Без секции");
		expect(s.groups.presets).toHaveLength(3);
	});
});

describe("priority levels", () => {
	it("are p1 red and p2 orange unless set, and an empty list stays empty", () => {
		expect(settingsFrom(null).priorities).toEqual([
			{ prefix: "p1", color: "red" },
			{ prefix: "p2", color: "orange" },
		]);
		expect(settingsFrom({ priorities: [] }).priorities).toEqual([]);
	});
});

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, partition, settingsFrom, sharedOf } from "../src/settings";

describe("settingsFrom", () => {
	it("returns the defaults for nothing saved", () => {
		expect(settingsFrom(null)).toEqual(DEFAULT_SETTINGS);
	});

	it("marks alarms with 🚨 and no reminder with 🔕 unless set", () => {
		expect(settingsFrom(null)).toMatchObject({ slotMarker: "⏰", alarmSlotMarker: "🚨", liveSlotMarker: "📌", silentSlotMarker: "🔕" });
	});

	it("starts the day at 5 unless set", () => {
		expect(settingsFrom(null).dayStartHour).toBe(5);
		expect(settingsFrom({ dayStartHour: 4 }).dayStartHour).toBe(4);
	});

	it("draws cards 35 px high, 2 px apart, unless set", () => {
		expect(settingsFrom(null)).toMatchObject({ cardHeight: 35, cardGap: 2 });
		expect(settingsFrom({ cardHeight: 30, cardGap: 0 })).toMatchObject({ cardHeight: 30, cardGap: 0 });
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
		const groups = { presets: ["Утро"], ungrouped: "No section" };
		expect(partition({ groups }).shared).toEqual({ groups });
	});
});

describe("the device's part of the settings", () => {
	it("keeps the divider's place, the column shown and the zoom apart from what the file holds", () => {
		expect(partition({ listShare: 0.4, rightMode: "soon", zoom: 112, longPressMs: 300 })).toEqual({ device: { listShare: 0.4, rightMode: "soon", zoom: 112 }, shared: { longPressMs: 300 } });
		expect(partition({ zoom: "wholeDay" }).device).toEqual({ zoom: "wholeDay" });
	});

	it("leaves them out of what is written to the file", () => {
		const shared = sharedOf(DEFAULT_SETTINGS) as Record<string, unknown>;
		expect("listShare" in shared).toBe(false);
		expect("rightMode" in shared).toBe(false);
		expect("zoom" in shared).toBe(false);
		expect(shared.google).toEqual(DEFAULT_SETTINGS.google);
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

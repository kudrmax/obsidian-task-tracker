import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, partition, settingsFrom, sharedOf } from "../src/settings";

describe("settingsFrom", () => {
	it("returns the defaults for nothing saved", () => {
		expect(settingsFrom(null)).toEqual(DEFAULT_SETTINGS);
	});

	it("starts the day at 5 unless set", () => {
		expect(settingsFrom(null).dayStartHour).toBe(5);
		expect(settingsFrom({ dayStartHour: 4 }).dayStartHour).toBe(4);
	});

	it("keeps the other nested keys when one is saved", () => {
		const s = settingsFrom({ google: { clientId: "id" }, sections: { now: "Today" } });
		expect(s.google.clientId).toBe("id");
		expect(s.google.refreshSeconds).toBe(60);
		expect(s.sections.now).toBe("Today");
		expect(s.sections.done).toBe("Done");
	});
});

describe("the device's part of the settings", () => {
	it("keeps the divider's place and the column shown apart from what the file holds", () => {
		expect(partition({ listWidth: 200, rightMode: "soon", longPressMs: 300 })).toEqual({ device: { listWidth: 200, rightMode: "soon" }, shared: { longPressMs: 300 } });
	});

	it("leaves them out of what is written to the file", () => {
		const shared = sharedOf(DEFAULT_SETTINGS) as Record<string, unknown>;
		expect("listWidth" in shared).toBe(false);
		expect("rightMode" in shared).toBe(false);
		expect(shared.google).toEqual(DEFAULT_SETTINGS.google);
	});
});

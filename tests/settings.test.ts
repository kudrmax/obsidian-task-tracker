import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, partition, settingsFrom, sameLevels, sharedOf, usableLevels, usablePrefix } from "../src/settings";

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
		expect(partition({ listShare: 0.4, rightMode: "soon", longPressMs: 300 })).toEqual({ device: { listShare: 0.4, rightMode: "soon" }, shared: { longPressMs: 300 } });
	});

	it("leaves them out of what is written to the file", () => {
		const shared = sharedOf(DEFAULT_SETTINGS) as Record<string, unknown>;
		expect("listShare" in shared).toBe(false);
		expect("rightMode" in shared).toBe(false);
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

	it("take only a prefix that is one word", () => {
		expect(usablePrefix("p1")).toBe(true);
		expect(usablePrefix("!!")).toBe(true);
		expect(usablePrefix("")).toBe(false);
		expect(usablePrefix("p 1")).toBe(false);
	});

	it("drop a level without a usable prefix and the second of two with one prefix", () => {
		expect(usableLevels([
			{ prefix: "p1", color: "blue" },
			{ prefix: "", color: "green" },
			{ prefix: "p1", color: "red" },
			{ prefix: "p2", color: "orange" },
		])).toEqual([
			{ prefix: "p1", color: "blue" },
			{ prefix: "p2", color: "orange" },
		]);
	});

	it("tell levels apart by their content, not by the list they come in", () => {
		const copy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.priorities));
		expect(sameLevels(DEFAULT_SETTINGS.priorities, copy)).toBe(true);
		expect(sameLevels(DEFAULT_SETTINGS.priorities, [{ prefix: "p1", color: "blue" }, { prefix: "p2", color: "orange" }])).toBe(false);
		expect(sameLevels(DEFAULT_SETTINGS.priorities, DEFAULT_SETTINGS.priorities.slice(0, 1))).toBe(false);
	});
});

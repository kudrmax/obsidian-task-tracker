import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, settingsFrom } from "../src/settings";

describe("settingsFrom", () => {
	it("returns the defaults for nothing saved", () => {
		expect(settingsFrom(null)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps the other nested keys when one is saved", () => {
		const s = settingsFrom({ google: { clientId: "id" }, sections: { now: "Today" } });
		expect(s.google.clientId).toBe("id");
		expect(s.google.refreshSeconds).toBe(60);
		expect(s.sections.now).toBe("Today");
		expect(s.sections.done).toBe("Done");
	});
});

import { describe, expect, it } from "vitest";
import { SettingsServiceImpl } from "../../core/application/SettingsServiceImpl";
import { markersOf, readingKey } from "../../core/application/documentText";
import { readsAnew } from "../../core/application/readingSettings";
import { DEFAULT_SETTINGS, settingsFrom, type TaskCalendarSettings } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

function service(start: Partial<TaskCalendarSettings> = {}) {
	const store = new FakeSettingsStore({ ...DEFAULT_SETTINGS, ...start });
	return { svc: new SettingsServiceImpl(store), now: () => store.get() };
}

describe("the Result mark setting", () => {
	it("is 🎯 unless set, and anything but text reads as the default", () => {
		expect(settingsFrom(null).resultMark).toBe("🎯");
		expect(settingsFrom({ resultMark: "★" }).resultMark).toBe("★");
		expect(settingsFrom({ resultMark: 5 }).resultMark).toBe("🎯");
	});

	it("is on the form beside the priorities", () => {
		expect(service({ resultMark: "★" }).svc.form().resultMark).toBe("★");
	});

	it("is written trimmed when it is one word that is no level's prefix; else the one saved stays", async () => {
		const { svc, now } = service();
		await svc.setResultMark(" ★ ");
		expect(now().resultMark).toBe("★");
		for (const bad of ["", "  ", "two words", "p1"]) {
			await svc.setResultMark(bad);
			expect(now().resultMark).toBe("★");
		}
	});

	it("marks results when the file is read, none when it can't be used, and a change reads the file anew", () => {
		expect(markersOf(DEFAULT_SETTINGS).result).toBe("🎯");
		expect(markersOf({ ...DEFAULT_SETTINGS, resultMark: "p1" }).result).toBeUndefined();
		const other = { ...DEFAULT_SETTINGS, resultMark: "★" };
		expect(readingKey(other)).not.toBe(readingKey(DEFAULT_SETTINGS));
		expect(readsAnew(DEFAULT_SETTINGS, other)).toBe(true);
	});
});

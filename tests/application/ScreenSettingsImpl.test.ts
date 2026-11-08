import { describe, expect, it } from "vitest";
import { ScreenSettingsImpl, screenSettingsOf } from "../../core/application/ScreenSettingsImpl";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

describe("ScreenSettingsImpl", () => {
	it("shows a screen what it draws of the shared settings, and nothing of the sources", () => {
		const google = { ...DEFAULT_SETTINGS.google, clientSecret: "secret", refreshToken: "token" };
		const shown = new ScreenSettingsImpl(new FakeSettingsStore({ ...DEFAULT_SETTINGS, google })).get();
		expect(shown).toEqual({
			longPressMs: 250,
			scrollToHour: 9,
			tasksFile: "TODOs Tasks.md",
			sections: DEFAULT_SETTINGS.sections,
			ungrouped: "No section",
			priorities: DEFAULT_SETTINGS.priorities,
			labels: [],
			labelPaint: "stripes",
		});
		expect(JSON.stringify(shown)).not.toMatch(/secret|token|google/);
	});

	it("is the same object while the settings are, and a new one once they change", async () => {
		const store = new FakeSettingsStore();
		const screen = new ScreenSettingsImpl(store);
		const first = screen.get();
		expect(screen.get()).toBe(first);
		await store.update({ longPressMs: 400 });
		expect(screen.get()).not.toBe(first);
		expect(screen.get().longPressMs).toBe(400);
	});

	it("tells how a card of several labels is painted", () => {
		expect(screenSettingsOf({ ...DEFAULT_SETTINGS, labelPaint: "blend" }).labelPaint).toBe("blend");
	});

	it("reads No section's name from the sections' settings", () => {
		expect(screenSettingsOf({ ...DEFAULT_SETTINGS, groups: { presets: [], ungrouped: "Loose" } }).ungrouped).toBe("Loose");
	});
});

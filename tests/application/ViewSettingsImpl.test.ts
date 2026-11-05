import { describe, expect, it } from "vitest";
import { screenSettingsOf, ViewSettingsImpl } from "../../src/application/ViewSettingsImpl";
import { DEVICE_STATE_KEY, PluginSettings, type SettingsPersistence } from "../../src/infrastructure/PluginSettings";
import { DEFAULT_SETTINGS, sharedOf } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

class Disk implements SettingsPersistence {
	text = JSON.stringify(sharedOf(DEFAULT_SETTINGS), null, 2);
	saves = 0;
	readonly local = new Map<string, unknown>();

	async loadData(): Promise<unknown> {
		return JSON.parse(this.text);
	}

	async saveData(data: unknown): Promise<void> {
		this.saves++;
		this.text = JSON.stringify(data, null, 2);
	}

	loadLocalStorage(key: string): unknown {
		return this.local.get(key) ?? null;
	}

	saveLocalStorage(key: string, data: unknown): void {
		this.local.set(key, structuredClone(data));
	}
}

describe("ViewSettingsImpl", () => {
	it("shows the screen its own settings and what it draws, and nothing of the sources", () => {
		const google = { ...DEFAULT_SETTINGS.google, clientSecret: "secret", refreshToken: "token" };
		const shown = new ViewSettingsImpl(new FakeSettingsStore({ ...DEFAULT_SETTINGS, google })).get();
		expect(shown).toEqual({
			listShare: 0.5,
			rightMode: "calendar",
			zoom: 56,
			zoomLevels: DEFAULT_SETTINGS.zoomLevels,
			cardHeight: 35,
			cardGap: 2,
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
		const view = new ViewSettingsImpl(store);
		const first = view.get();
		expect(view.get()).toBe(first);
		await store.update({ cardGap: 4 });
		expect(view.get()).not.toBe(first);
		expect(view.get().cardGap).toBe(4);
	});

	it("keeps what the screen sets on the device: data.json is not touched", async () => {
		const disk = new Disk();
		const settings = new PluginSettings(disk, "data.json");
		await settings.load();
		const view = new ViewSettingsImpl(settings);
		let told = 0;
		view.onChange(() => told++);
		await view.set({ listShare: 0.3 });
		await view.set({ rightMode: "soon" });
		await view.set({ zoom: "wholeDay" });
		expect(disk.local.get(DEVICE_STATE_KEY)).toEqual({ listShare: 0.3, rightMode: "soon", zoom: "wholeDay" });
		expect(disk.saves).toBe(0);
		expect(view.get()).toMatchObject({ listShare: 0.3, rightMode: "soon", zoom: "wholeDay" });
		expect(told).toBe(3);
	});

	it("reads No section's name from the sections' settings", () => {
		expect(screenSettingsOf({ ...DEFAULT_SETTINGS, groups: { presets: [], ungrouped: "Loose" } }).ungrouped).toBe("Loose");
	});
});

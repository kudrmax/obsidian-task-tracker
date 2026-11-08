import { describe, expect, it } from "vitest";
import { ScreenSettingsImpl } from "../../core/application/ScreenSettingsImpl";
import { DEVICE_STATE_KEY, PluginSettings, type SettingsPersistence } from "../../obsidian/infrastructure/PluginSettings";
import { SETTINGS_FILE, type StoredSettings } from "../../obsidian/settingsFile";
import { ShownSettingsStore, VIEW_DEFAULTS, ViewSettingsStore, viewSettingsFrom } from "../../obsidian/ui/viewSettings";

class Disk implements SettingsPersistence {
	text = "{}";
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

async function stored(disk = new Disk()): Promise<{ disk: Disk; settings: PluginSettings<StoredSettings> }> {
	const settings = new PluginSettings(disk, "data.json", SETTINGS_FILE);
	await settings.load();
	return { disk, settings };
}

describe("view settings", () => {
	it("read what was saved, the defaults for the rest, and nothing else", () => {
		expect(viewSettingsFrom(null)).toEqual(VIEW_DEFAULTS);
		expect(viewSettingsFrom({ zoomLevels: [{ hourPx: 40 }], cardGap: 4, tasksFile: "x.md" })).toEqual({ ...VIEW_DEFAULTS, zoomLevels: [{ hourPx: 40 }] });
	});

	it("keep what the screen sets on the device: data.json is not touched", async () => {
		const { disk, settings } = await stored();
		const view = new ViewSettingsStore(settings);
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

	it("write the zoom levels typed as heights, and nothing for text that isn't", async () => {
		const { disk, settings } = await stored();
		const view = new ViewSettingsStore(settings);
		await view.setZoomLevels("28, x");
		expect(disk.saves).toBe(0);
		await view.setZoomLevels(" 40 , 80");
		expect(view.get().zoomLevels).toEqual([{ hourPx: 40 }, { hourPx: 80 }]);
		expect(JSON.parse(disk.text).zoomLevels).toEqual([{ hourPx: 40 }, { hourPx: 80 }]);
	});

	it("are the same object while the settings are", async () => {
		const { settings } = await stored();
		const view = new ViewSettingsStore(settings);
		const first = view.get();
		expect(view.get()).toBe(first);
		await view.set({ zoomLevels: [{ hourPx: 40 }] });
		expect(view.get()).not.toBe(first);
		expect(view.get().zoomLevels).toEqual([{ hourPx: 40 }]);
	});
});

describe("ShownSettingsStore", () => {
	it("shows the screen the shared settings it draws and its own as one, the same object while neither changes", async () => {
		const { settings } = await stored();
		const shown = new ShownSettingsStore(new ScreenSettingsImpl(settings), new ViewSettingsStore(settings));
		const first = shown.get();
		expect(first).toMatchObject({ tasksFile: "TODOs Tasks.md", cardHeight: 35, rightMode: "calendar", longPressMs: 250 });
		expect(shown.get()).toBe(first);
		expect(JSON.stringify(first)).not.toMatch(/google/);
	});

	it("tells once of a change both parts tell of", async () => {
		const { settings } = await stored();
		const shown = new ShownSettingsStore(new ScreenSettingsImpl(settings), new ViewSettingsStore(settings));
		let told = 0;
		shown.onChange(() => told++);
		await shown.set({ rightMode: "inbox" });
		expect(told).toBe(1);
		expect(shown.get().rightMode).toBe("inbox");
	});
});

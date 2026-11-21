import { describe, expect, it } from "vitest";
import { DeviceSettings } from "../../obsidian/adapters/DeviceSettings";
import { LocalProjectsScreenStore, PROJECTS_SCREEN_KEY } from "../../obsidian/infrastructure/LocalProjectsScreenStore";
import { DEVICE_STATE_KEY, PluginSettings } from "../../obsidian/infrastructure/PluginSettings";
import { memoryCore } from "../../obsidian/memoryCore";
import { SETTINGS_FILE } from "../../obsidian/settingsFile";
import { NOW, standText } from "./standCore";

/** Obsidian's two stores of a plugin: data.json, and the device's local storage. */
function obsidianStorage(local: Record<string, unknown>) {
	let data: unknown = null;
	return {
		local,
		loadData: async () => data,
		saveData: async (next: unknown) => void (data = next),
		loadLocalStorage: (key: string) => local[key] ?? null,
		saveLocalStorage: (key: string, value: unknown) => void (local[key] = value),
	};
}

async function device(local: Record<string, unknown>) {
	const storage = obsidianStorage(local);
	const settings = new PluginSettings(storage, "data.json", SETTINGS_FILE);
	await settings.load();
	const { core } = memoryCore(standText(NOW), { now: () => NOW }, {}, [], new LocalProjectsScreenStore(storage));
	return { storage, device: new DeviceSettings(settings, core.tasks, () => settings.get().zoomLevels) };
}

describe("the engine's device settings are the old screen's keys", () => {
	it("reads the divider's share, the zoom and the tree's width from the device's keys, and keeps them there", async () => {
		const { storage, device: settings } = await device({ [DEVICE_STATE_KEY]: { listShare: 0.3, zoom: 112, treeWidth: 240 } });
		expect([settings.listShare(), settings.zoom().kept, settings.treeWidth()]).toEqual([0.3, 112, 240]);
		expect(settings.zoom().most).toBe(224);
		settings.zoom().keep("wholeDay");
		await settings.keepListShare(0.6);
		await settings.keepTreeWidth(300);
		expect(storage.local[DEVICE_STATE_KEY]).toEqual({ listShare: 0.6, zoom: "wholeDay", treeWidth: 300 });
	});

	it("reads the view mode, a note block's mode and Subprojects from the core's Projects screen, and keeps them there", async () => {
		const { storage, device: settings } = await device({ [PROJECTS_SCREEN_KEY]: JSON.stringify({ view: "rows", noteView: "byProject", subprojects: false }) });
		expect(settings.viewOf(true, false).chosen).toBe("rows");
		expect(settings.viewOf(true, true).chosen).toBe("byProject");
		await settings.keepView("twoColumns", false);
		await settings.keepView("rows", true);
		await settings.toggleSubprojects();
		expect(JSON.parse(storage.local[PROJECTS_SCREEN_KEY] as string)).toMatchObject({ view: "twoColumns", noteView: "rows", subprojects: true });
	});
});

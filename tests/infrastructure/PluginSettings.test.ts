import { describe, expect, it } from "vitest";
import { PluginSettings, type SettingsPersistence } from "../../src/infrastructure/PluginSettings";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { SETTINGS_FILE, type StoredSettings } from "../../src/settingsFile";

/** The file the defaults are written as: every key but the device's. */
const DEFAULT_FILE: Partial<StoredSettings> = (({ listShare: _s, rightMode: _m, zoom: _z, ...file }) => file)(SETTINGS_FILE.from(null));

const FILE = ".obsidian/plugins/task-calendar/data.json";

class FakeHost implements SettingsPersistence {
	file: unknown = DEFAULT_FILE;
	readonly local = new Map<string, unknown>();
	loads = 0;
	saves = 0;
	localSaves = 0;
	gate: Promise<void> | null = null;
	failNextSave = false;

	async loadData(): Promise<unknown> {
		this.loads++;
		return structuredClone(this.file);
	}

	async saveData(data: unknown): Promise<void> {
		this.saves++;
		if (this.failNextSave) {
			this.failNextSave = false;
			throw new Error("disk full");
		}
		this.file = structuredClone(data);
		if (this.gate) await this.gate;
	}

	loadLocalStorage(key: string): unknown {
		return this.local.get(key) ?? null;
	}

	saveLocalStorage(key: string, data: unknown): void {
		this.localSaves++;
		this.local.set(key, data);
	}

	fileSettings(): StoredSettings {
		return this.file as StoredSettings;
	}
}

function opened(): { gate: Promise<void>; open: () => void } {
	let open = (): void => undefined;
	const gate = new Promise<void>((resolve) => (open = resolve));
	return { gate, open };
}

async function loaded(host = new FakeHost()) {
	const settings = new PluginSettings(host, FILE, SETTINGS_FILE);
	await settings.load();
	host.loads = 0;
	let told = 0;
	settings.onChange(() => told++);
	return { settings, host, told: () => told };
}

describe("PluginSettings", () => {
	it("a file without the repeat marker loads it as the default", async () => {
		const host = new FakeHost();
		const { repeatMarker: _, ...old } = DEFAULT_SETTINGS;
		host.file = old;
		const { settings } = await loaded(host);
		expect(settings.get().repeatMarker).toBe("🔁");
	});

	it("a device-only patch neither reads nor writes data.json and tells the listeners once", async () => {
		const { settings, host, told } = await loaded();
		await settings.update({ rightMode: "soon" });
		expect(host.loads).toBe(0);
		expect(host.saves).toBe(0);
		expect(host.localSaves).toBe(1);
		expect(told()).toBe(1);
		expect(settings.get().rightMode).toBe("soon");
	});

	it("a shared patch reads the file once, writes it once and tells once", async () => {
		const { settings, host, told } = await loaded();
		await settings.update({ scrollToHour: 7 });
		expect([host.loads, host.saves, told()]).toEqual([1, 1, 1]);
		expect(host.fileSettings().scrollToHour).toBe(7);
	});

	it("its own write coming back tells nobody", async () => {
		const { settings, host, told } = await loaded();
		await settings.update({ scrollToHour: 7 });
		await settings.reload();
		expect(host.loads).toBe(2);
		expect(told()).toBe(1);
	});

	it("a file Sync changed is seen and told", async () => {
		const { settings, host, told } = await loaded();
		await settings.update({ rightMode: "inbox" });
		const before = told();
		const file = host.fileSettings();
		host.file = { ...file, google: { ...file.google, refreshToken: "fromMac" } };
		await settings.reload();
		expect(told()).toBe(before + 1);
		expect(settings.get().google.refreshToken).toBe("fromMac");
		expect(settings.get().rightMode).toBe("inbox");
	});

	it("a shared patch is seen by get() at once, before the file is written", async () => {
		const { settings, host } = await loaded();
		const { gate, open } = opened();
		host.gate = gate;
		const done = settings.update({ dueDateMarker: "D" });
		expect(settings.get().dueDateMarker).toBe("D");
		open();
		await done;
		expect(host.fileSettings().dueDateMarker).toBe("D");
	});

	it("two shared patches in a row both reach the file", async () => {
		const { settings, host } = await loaded();
		const first = settings.update({ dueDateMarker: "D" });
		const second = settings.update({ slotMarker: "S" });
		await Promise.all([first, second]);
		expect(host.fileSettings().dueDateMarker).toBe("D");
		expect(host.fileSettings().slotMarker).toBe("S");
		expect(host.saves).toBe(2);
		expect(host.loads).toBe(2);
		expect(settings.get().dueDateMarker).toBe("D");
		expect(settings.get().slotMarker).toBe("S");
	});

	it("Sync arriving while a write waits keeps both", async () => {
		const { settings, host, told } = await loaded();
		const { gate, open } = opened();
		host.gate = gate;
		const written = settings.update({ dueDateMarker: "D" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(host.saves).toBe(1);
		const file = host.fileSettings();
		host.file = { ...file, google: { ...file.google, refreshToken: "fromMac" } };
		const reloaded = settings.reload();
		open();
		await Promise.all([written, reloaded]);
		expect(settings.get().dueDateMarker).toBe("D");
		expect(settings.get().google.refreshToken).toBe("fromMac");
		expect(told()).toBeGreaterThanOrEqual(2);
	});

	it("a patch that changes nothing in the file does not write it", async () => {
		const { settings, host } = await loaded();
		await settings.update({ scrollToHour: DEFAULT_SETTINGS.scrollToHour });
		expect(host.saves).toBe(0);
	});

	it("a failed write takes its patch back out of get()", async () => {
		const { settings, host } = await loaded();
		host.failNextSave = true;
		await expect(settings.update({ dueDateMarker: "D" })).rejects.toThrow("disk full");
		expect(settings.get().dueDateMarker).toBe(DEFAULT_SETTINGS.dueDateMarker);
		await settings.update({ slotMarker: "S" });
		expect(host.fileSettings().slotMarker).toBe("S");
		expect(host.saves).toBe(2);
	});

	it("owns only data.json in the plugin folder", () => {
		const settings = new PluginSettings(new FakeHost(), FILE, SETTINGS_FILE);
		expect(settings.owns(".obsidian/plugins/task-calendar/data.json")).toBe(true);
		expect(settings.owns("x/data.json")).toBe(false);
	});

	it("the first read tells the listeners even when nothing differs from the defaults", async () => {
		const host = new FakeHost();
		const settings = new PluginSettings(host, FILE, SETTINGS_FILE);
		let told = 0;
		settings.onChange(() => told++);
		await settings.load();
		expect(told).toBe(1);
	});
});

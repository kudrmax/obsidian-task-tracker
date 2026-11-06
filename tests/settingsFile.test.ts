import { describe, expect, it } from "vitest";
import { DEVICE_STATE_KEY, PluginSettings, type SettingsPersistence } from "../src/infrastructure/PluginSettings";
import { SETTINGS_FILE } from "../src/settingsFile";

/** data.json as 0.4.155 wrote it for the defaults, the device's part left out. */
const OLD_FILE = `{
  "tasksFile": "TODOs Tasks.md",
  "sections": {
    "inbox": "Inbox",
    "now": "Now",
    "soon": "Soon",
    "backlog": "Backlog",
    "done": "Done"
  },
  "dueDateMarker": "📅",
  "slotMarker": "⏰",
  "alarmSlotMarker": "🚨",
  "liveSlotMarker": "📌",
  "silentSlotMarker": "🔕",
  "repeatMarker": "🔁",
  "collapsedMarker": "📁",
  "workCalendarFile": "calendar/work.json",
  "workCalendarTitles": [],
  "hiddenCalendars": [],
  "calendarsMigrated": false,
  "google": {
    "clientId": "",
    "clientSecret": "",
    "refreshToken": "",
    "calendarIds": [],
    "refreshSeconds": 60
  },
  "longPressMs": 250,
  "zoomLevels": [
    {
      "hourPx": 28
    },
    {
      "hourPx": 56
    },
    {
      "hourPx": 112
    },
    {
      "hourPx": 224
    }
  ],
  "scrollToHour": 9,
  "dayStartHour": 5,
  "staleAfterMinutes": 180,
  "priorities": [
    {
      "prefix": "p1",
      "color": "red"
    },
    {
      "prefix": "p2",
      "color": "orange"
    }
  ],
  "labelTag": "label",
  "labels": [],
  "labelPaint": "stripes",
  "groups": {
    "presets": [
      "Morning",
      "Afternoon",
      "Evening"
    ],
    "ungrouped": "No section"
  },
  "cardHeight": 35,
  "cardGap": 2
}`;

class Disk implements SettingsPersistence {
	saves = 0;
	readonly local = new Map<string, unknown>();
	constructor(public text: string | null) {}
	async loadData(): Promise<unknown> {
		return this.text === null ? null : JSON.parse(this.text);
	}
	async saveData(data: unknown): Promise<void> {
		this.saves++;
		this.text = JSON.stringify(data, null, 2);
	}
	loadLocalStorage(key: string): unknown {
		return this.local.get(key) ?? null;
	}
	saveLocalStorage(key: string, data: unknown): void {
		this.local.set(key, data);
	}
}

async function opened(disk: Disk) {
	const settings = new PluginSettings(disk, "data.json", SETTINGS_FILE);
	await settings.load();
	return settings;
}

describe("data.json", () => {
	it("an old file is read as it was: the shared settings and the view's own", async () => {
		const settings = await opened(new Disk(OLD_FILE.replace('"cardHeight": 35', '"cardHeight": 30').replace('"dayStartHour": 5', '"dayStartHour": 4')));
		expect(settings.get()).toMatchObject({ cardHeight: 30, dayStartHour: 4, labelPaint: "stripes", zoomLevels: [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }] });
	});

	it("a change of a shared setting or the view's writes the file as before, byte for byte", async () => {
		const disk = new Disk(OLD_FILE);
		const settings = await opened(disk);
		await settings.update({ dayStartHour: 4 });
		expect(disk.text).toBe(OLD_FILE.replace('"dayStartHour": 5', '"dayStartHour": 4'));
		await settings.update({ cardGap: 3 });
		expect(disk.text).toBe(OLD_FILE.replace('"dayStartHour": 5', '"dayStartHour": 4').replace('"cardGap": 2', '"cardGap": 3'));
	});

	it("a new file is written with every key in its old place", async () => {
		const disk = new Disk(null);
		const settings = await opened(disk);
		await settings.update({ dayStartHour: 4 });
		expect(disk.text).toBe(OLD_FILE.replace('"dayStartHour": 5', '"dayStartHour": 4'));
	});

	it("keeps an unknown key after the known ones, and the device's part off the file", async () => {
		const disk = new Disk(OLD_FILE.replace('"cardGap": 2\n}', '"cardGap": 2,\n  "future": 1\n}'));
		const settings = await opened(disk);
		await settings.update({ rightMode: "soon", cardGap: 3 });
		expect(disk.text).toBe(OLD_FILE.replace('"cardGap": 2\n}', '"cardGap": 3,\n  "future": 1\n}'));
		expect(disk.local.get(DEVICE_STATE_KEY)).toEqual({ rightMode: "soon" });
	});
});

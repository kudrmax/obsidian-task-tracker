import { describe, expect, it } from "vitest";
import { screenSettingsOf } from "../../src/application/ScreenSettingsImpl";
import { type StoredSettings, storedSettingsFrom } from "../../src/settingsFile";
import { settingsEffect } from "../../src/ui/settingsEffect";
import { viewSettingsFrom } from "../../src/ui/viewSettings";

const before = storedSettingsFrom(null);
const shown = (settings: StoredSettings) => ({ ...screenSettingsOf(settings), ...viewSettingsFrom(settings) });
const after = (patch: Partial<StoredSettings>) => settingsEffect(shown(before), shown({ ...before, ...patch }));
const NOTHING = { restack: false, frame: false, drawn: false };

describe("settingsEffect", () => {
	it("restacks the timeline for another card height", () => {
		expect(after({ cardHeight: 36 })).toEqual({ ...NOTHING, restack: true });
	});

	it("restacks the timeline for another gap between cards", () => {
		expect(after({ cardGap: 8 })).toEqual({ ...NOTHING, restack: true });
	});

	it("redraws what it draws for another tasks file: the missing file's path", () => {
		expect(after({ tasksFile: "Other.md" })).toEqual({ ...NOTHING, drawn: true });
	});

	it("redraws what it draws for any section renamed: the headers", () => {
		for (const name of ["inbox", "now", "soon", "backlog", "done"] as const) {
			expect(after({ sections: { ...before.sections, [name]: "Renamed" } })).toEqual({ ...NOTHING, drawn: true });
		}
	});

	it("redraws what it draws for another name of No section", () => {
		expect(after({ groups: { ...before.groups, ungrouped: "Loose" } })).toEqual({ ...NOTHING, drawn: true });
	});

	it("redraws what it draws for other priority levels: the quick bar's", () => {
		expect(after({ priorities: [{ prefix: "p9", color: "blue" }] })).toEqual({ ...NOTHING, drawn: true });
	});

	it("nothing for the marks and the presets, which only read the tasks anew, nor for the hour the day starts at: the services tell", () => {
		for (const patch of [{ repeatMarker: "↻" }, { dueDateMarker: "🗓" }, { slotMarker: "🕐" }, { alarmSlotMarker: "🔔" }, { liveSlotMarker: "🪧" }, { silentSlotMarker: "🤫" }, { groups: { ...before.groups, presets: ["Night"] } }, { dayStartHour: 3 }]) {
			expect(after(patch)).toEqual(NOTHING);
		}
	});

	it("redraws the frame for the divider or the column shown, set by another view", () => {
		expect(after({ listShare: 0.3 })).toEqual({ ...NOTHING, frame: true });
		expect(after({ rightMode: "soon" })).toEqual({ ...NOTHING, frame: true });
	});

	it("nothing for the zoom", () => {
		expect(after({ zoom: 112 })).toEqual(NOTHING);
	});

	it("nothing for the same settings copied", () => {
		expect(settingsEffect(shown(before), shown(structuredClone(before)))).toEqual(NOTHING);
	});
});

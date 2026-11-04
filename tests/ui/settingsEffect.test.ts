import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../src/settings";
import { settingsEffect } from "../../src/ui/settingsEffect";

const before = DEFAULT_SETTINGS;
const after = (patch: Partial<TaskCalendarSettings>) => settingsEffect(before, { ...before, ...patch });
const NOTHING = { restack: false, reload: false, newDay: false, frame: false };

describe("settingsEffect", () => {
	it("restacks the timeline for another card height", () => {
		expect(after({ cardHeight: 36 })).toEqual({ ...NOTHING, restack: true });
	});

	it("restacks the timeline for another gap between cards", () => {
		expect(after({ cardGap: 8 })).toEqual({ ...NOTHING, restack: true });
	});

	it("reloads the tasks for another tasks file", () => {
		expect(after({ tasksFile: "Other.md" })).toEqual({ ...NOTHING, reload: true });
	});

	it("reloads the tasks for any section renamed", () => {
		for (const name of ["inbox", "now", "soon", "backlog", "done"] as const) {
			expect(after({ sections: { ...before.sections, [name]: "Renamed" } })).toEqual({ ...NOTHING, reload: true });
		}
	});

	it("reloads the tasks for another due date marker", () => {
		expect(after({ dueDateMarker: "🗓" })).toEqual({ ...NOTHING, reload: true });
	});

	it("reloads the tasks for another slot marker", () => {
		expect(after({ slotMarker: "🕐" })).toEqual({ ...NOTHING, reload: true });
		expect(after({ alarmSlotMarker: "🔔" })).toEqual({ ...NOTHING, reload: true });
		expect(after({ silentSlotMarker: "🤫" })).toEqual({ ...NOTHING, reload: true });
	});

	it("reloads the tasks for another name of No section", () => {
		expect(after({ groups: { ...before.groups, ungrouped: "Loose" } })).toEqual({ ...NOTHING, reload: true });
	});

	it("reloads the tasks for other preset sections", () => {
		expect(after({ groups: { ...before.groups, presets: ["Night"] } })).toEqual({ ...NOTHING, reload: true });
	});

	it("reloads the tasks for other priority levels", () => {
		expect(after({ priorities: [{ prefix: "p9", color: "blue" }] })).toEqual({ ...NOTHING, reload: true });
	});

	it("opens a new day for another hour the day starts at", () => {
		expect(after({ dayStartHour: 3 })).toEqual({ ...NOTHING, newDay: true });
	});

	it("redraws the frame for the divider or the column shown, set by another view", () => {
		expect(after({ listShare: 0.3 })).toEqual({ ...NOTHING, frame: true });
		expect(after({ rightMode: "soon" })).toEqual({ ...NOTHING, frame: true });
	});

	it("nothing for the zoom", () => {
		expect(after({ zoom: 112 })).toEqual(NOTHING);
	});

	it("nothing for the same settings copied", () => {
		expect(settingsEffect(before, structuredClone(before))).toEqual(NOTHING);
	});
});

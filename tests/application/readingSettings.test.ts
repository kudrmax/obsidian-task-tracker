import { describe, expect, it } from "vitest";
import { readsAnew } from "../../core/application/readingSettings";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../core/settings";

const before = DEFAULT_SETTINGS;
const after = (patch: Partial<TaskCalendarSettings>) => readsAnew(before, { ...before, ...patch });

describe("readsAnew", () => {
	it("for another tasks file", () => {
		expect(after({ tasksFile: "Other.md" })).toBe(true);
	});

	it("for any section renamed", () => {
		for (const name of ["inbox", "now", "soon", "backlog", "done"] as const) {
			expect(after({ sections: { ...before.sections, [name]: "Renamed" } })).toBe(true);
		}
	});

	it("for another repeat marker", () => {
		expect(after({ repeatMarker: "↻" })).toBe(true);
	});

	it("for another due date marker", () => {
		expect(after({ dueDateMarker: "🗓" })).toBe(true);
	});

	it("for another slot marker", () => {
		expect(after({ slotMarker: "🕐" })).toBe(true);
		expect(after({ alarmSlotMarker: "🔔" })).toBe(true);
		expect(after({ liveSlotMarker: "🪧" })).toBe(true);
		expect(after({ silentSlotMarker: "🤫" })).toBe(true);
	});

	it("for another name of No section", () => {
		expect(after({ groups: { ...before.groups, ungrouped: "Loose" } })).toBe(true);
	});

	it("for other preset sections", () => {
		expect(after({ groups: { ...before.groups, presets: ["Night"] } })).toBe(true);
	});

	it("for other priority levels", () => {
		expect(after({ priorities: [{ prefix: "p9", color: "blue" }] })).toBe(true);
	});

	it("not for the hour the day starts at, the long press or the hour a day opens at", () => {
		for (const patch of [{ dayStartHour: 3 }, { longPressMs: 400 }, { scrollToHour: 7 }]) expect(after(patch)).toBe(false);
	});

	it("not for the same settings copied", () => {
		expect(readsAnew(before, structuredClone(before))).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import type { ShownChange } from "../../core/application/contracts";
import { readsAnew, shownChange } from "../../core/application/readingSettings";
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

describe("shownChange", () => {
	const change = (patch: Partial<TaskCalendarSettings>) => shownChange(before, { ...before, ...patch });
	const none = { tasks: false, drawn: false, cards: false, timeline: false, gestures: false, calendars: false };

	const SHOWN: Readonly<Record<string, readonly [Partial<TaskCalendarSettings>, Partial<ShownChange>]>> = {
		tasksFile: [{ tasksFile: "Other.md" }, { tasks: true, drawn: true }],
		sections: [{ sections: { ...before.sections, inbox: "In" } }, { tasks: true, drawn: true }],
		groups: [{ groups: { ...before.groups, ungrouped: "Loose" } }, { tasks: true, drawn: true }],
		dueDateMarker: [{ dueDateMarker: "🗓" }, { tasks: true }],
		slotMarker: [{ slotMarker: "🕐" }, { tasks: true }],
		alarmSlotMarker: [{ alarmSlotMarker: "🔔" }, { tasks: true }],
		liveSlotMarker: [{ liveSlotMarker: "🪧" }, { tasks: true }],
		silentSlotMarker: [{ silentSlotMarker: "🔇" }, { tasks: true }],
		repeatMarker: [{ repeatMarker: "↻" }, { tasks: true }],
		collapsedMarker: [{ collapsedMarker: "🗃" }, { tasks: true }],
		labelTag: [{ labelTag: "tag" }, { tasks: true }],
		priorities: [{ priorities: [{ prefix: "p1", color: "blue" }] }, { tasks: true, drawn: true }],
		labels: [{ labels: [{ name: "Fast", color: "green" }] }, { tasks: true, drawn: true }],
		labelPaint: [{ labelPaint: "blend" }, { drawn: true }],
		cardHeight: [{ cardHeight: before.cardHeight + 4 }, { cards: true }],
		cardGap: [{ cardGap: before.cardGap + 2 }, { cards: true }],
		dayStartHour: [{ dayStartHour: 6 }, { timeline: true }],
		scrollToHour: [{ scrollToHour: 8 }, { timeline: true }],
		zoomLevels: [{ zoomLevels: [{ hourPx: 40 }, { hourPx: 80 }] }, { timeline: true }],
		longPressMs: [{ longPressMs: 400 }, { gestures: true }],
		hiddenCalendars: [{ hiddenCalendars: [{ account: "work", title: "Team" }] }, { calendars: true }],
		workCalendarFile: [{ workCalendarFile: "other.json" }, { calendars: true }],
		staleAfterMinutes: [{ staleAfterMinutes: 60 }, { calendars: true }],
	};
	const NOT_SHOWN: Readonly<Record<string, Partial<TaskCalendarSettings>>> = {
		resultMark: { resultMark: "✅" },
		projectTag: { projectTag: "#proj" },
		workCalendarTitles: { workCalendarTitles: ["Team"] },
		calendarsMigrated: { calendarsMigrated: true },
		google: { google: { ...before.google, refreshToken: "token" } },
		assistant: { assistant: { ...before.assistant, model: "other" } },
	};

	it("names every setting either shown, with what it changes, or not shown at all", () => {
		expect([...Object.keys(SHOWN), ...Object.keys(NOT_SHOWN)].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	});

	it("says which part of the screen each shown setting changes", () => {
		for (const [key, [patch, parts]] of Object.entries(SHOWN)) expect([key, change(patch)]).toEqual([key, { ...none, ...parts }]);
	});

	it("is null for a setting the screen does not show, and for the same settings", () => {
		for (const [key, patch] of Object.entries(NOT_SHOWN)) expect([key, change(patch)]).toEqual([key, null]);
		expect(shownChange(before, { ...before })).toBeNull();
	});

	it("reads the tasks anew exactly when readsAnew says so", () => {
		for (const [patch] of Object.values(SHOWN)) expect(change(patch)?.tasks ?? false).toBe(after(patch));
	});

	it("names a preset section as drawn: the menus offer it", () => {
		expect(change({ groups: { ...before.groups, presets: ["Night"] } })).toEqual({ ...none, tasks: true, drawn: true });
	});
});

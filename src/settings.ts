import type { GroupSettings } from "./domain/Groups";
import type { PriorityLevel } from "./domain/Priority";

export type { GroupSettings } from "./domain/Groups";
export { PRIORITY_COLORS, type PriorityColor, type PriorityLevel, sameLevels, usableLevels, usablePrefix } from "./domain/Priority";

/** Which pair of neighbouring columns the window shows: Inbox and Soon, Soon and Now, or Now and the calendar. */
export type RightMode = "calendar" | "soon" | "inbox";

/** A height of the hour the timeline settles on after a pinch; the step a drag snaps to follows from the height itself. */
export interface ZoomLevel {
	/** Height of one hour on the timeline, CSS px. */
	readonly hourPx: number;
}

/** Where the timeline was zoomed to: an hour's height, or the whole day, whatever the screen's height. */
export type Zoom = number | "wholeDay";

export interface SectionNames {
	readonly inbox: string;
	readonly now: string;
	readonly soon: string;
	readonly backlog: string;
	readonly done: string;
}

export interface GoogleSettings {
	readonly clientId: string;
	readonly clientSecret: string;
	readonly refreshToken: string;
	/** Calendar ids to show; empty means every calendar selected in Google. */
	readonly calendarIds: readonly string[];
	readonly refreshSeconds: number;
}

/** How the tasks file is written: where it is, its sections and the marks of its lines, the levels and the day's start. */
export interface FileFormatSettings {
	readonly tasksFile: string;
	readonly sections: SectionNames;
	readonly dueDateMarker: string;
	readonly slotMarker: string;
	/** Precedes the slot of a task that rings as an alarm on the phone. */
	readonly alarmSlotMarker: string;
	/** Precedes the slot of a task that the phone shows as a Live Activity on the lock screen. */
	readonly liveSlotMarker: string;
	/** Precedes the slot of a task that the phone does not remind of. */
	readonly silentSlotMarker: string;
	readonly repeatMarker: string;
	/** Priority levels in the order the menu and the task screen offer them. */
	readonly priorities: readonly PriorityLevel[];
	readonly groups: GroupSettings;
	/** The hour one day ends and the next begins, 0..23: today, the due dates and the timeline count from it. */
	readonly dayStartHour: number;
}

/** How the screen looks and answers: the columns, the zoom, the cards, the touch. */
export interface ViewSettings {
	/** The left column's share of the width the two columns split, 0..1, set by dragging the divider: the line keeps its place as the window changes. */
	readonly listShare: number;
	/** What the right column shows; the segmented control in the day row sets it. */
	readonly rightMode: RightMode;
	/** The zoom a pinch last settled on: the timeline opens at it. */
	readonly zoom: Zoom;
	readonly zoomLevels: readonly ZoomLevel[];
	/** A task card's height, px: the list, New task and the timeline's stack; its ends are round, half of it. */
	readonly cardHeight: number;
	/** Between two cards, px: in the list and in a stack on the timeline alike. */
	readonly cardGap: number;
	readonly longPressMs: number;
	/** The hour a day other than today scrolls to when opened. */
	readonly scrollToHour: number;
}

/** Where the events come from: the work file, Google, and when a source counts as stale. */
export interface SourceSettings {
	readonly workCalendarFile: string;
	/** Calendar titles to take from the work file; empty means all. */
	readonly workCalendarTitles: readonly string[];
	readonly google: GoogleSettings;
	/** A calendar source whose last update is older than this gets the orange dot. */
	readonly staleAfterMinutes: number;
}

/** data.json: one object, its parts typed apart. */
export type TaskCalendarSettings = FileFormatSettings & ViewSettings & SourceSettings;

export const LIST_WIDTH_MIN = 110;
export const LIST_WIDTH_MAX = 280;
export const CARD_HEIGHT_MIN = 28;
export const CARD_HEIGHT_MAX = 40;
export const CARD_GAP_MAX = 10;

export const DEFAULT_SETTINGS: TaskCalendarSettings = {
	tasksFile: "TODOs Tasks.md",
	sections: { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" },
	dueDateMarker: "📅",
	slotMarker: "⏰",
	alarmSlotMarker: "🚨",
	liveSlotMarker: "📌",
	silentSlotMarker: "🔕",
	repeatMarker: "🔁",
	workCalendarFile: "calendar/work.json",
	workCalendarTitles: [],
	google: { clientId: "", clientSecret: "", refreshToken: "", calendarIds: [], refreshSeconds: 60 },
	longPressMs: 250,
	zoom: 56,
	zoomLevels: [
		{ hourPx: 28 },
		{ hourPx: 56 },
		{ hourPx: 112 },
		{ hourPx: 224 },
	],
	scrollToHour: 9,
	dayStartHour: 5,
	listShare: 0.5,
	rightMode: "calendar",
	staleAfterMinutes: 180,
	priorities: [
		{ prefix: "p1", color: "red" },
		{ prefix: "p2", color: "orange" },
	],
	groups: { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" },
	cardHeight: 35,
	cardGap: 2,
};

/** What belongs to the device, not the vault: the divider's place, the column shown and the zoom are set by hand on each screen, and must not travel through Sync. */
export const DEVICE_KEYS = ["listShare", "rightMode", "zoom"] as const;
export type DeviceKey = (typeof DEVICE_KEYS)[number];
export type DeviceState = Pick<TaskCalendarSettings, DeviceKey>;
export type SharedSettings = Omit<TaskCalendarSettings, DeviceKey>;

/** Splits a patch into the part that goes to the device and the part that goes to the synced file. */
export function partition(patch: Partial<TaskCalendarSettings>): { device: Partial<DeviceState>; shared: Partial<SharedSettings> } {
	const device: Partial<Record<DeviceKey, unknown>> = {};
	const shared: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch)) {
		if ((DEVICE_KEYS as readonly string[]).includes(key)) device[key as DeviceKey] = value;
		else shared[key] = value;
	}
	return { device: device as Partial<DeviceState>, shared: shared as Partial<SharedSettings> };
}

/** The settings without the device's part: what the synced file holds. */
export function sharedOf(settings: TaskCalendarSettings): SharedSettings {
	const { listShare: _s, rightMode: _m, zoom: _z, ...shared } = settings;
	return shared;
}

/** Merges saved data over the defaults, one level deep for the nested objects. */
export function settingsFrom(saved: unknown): TaskCalendarSettings {
	const s = (saved ?? {}) as Partial<TaskCalendarSettings>;
	return {
		...DEFAULT_SETTINGS,
		...s,
		sections: { ...DEFAULT_SETTINGS.sections, ...(s.sections ?? {}) },
		google: { ...DEFAULT_SETTINGS.google, ...(s.google ?? {}) },
		groups: { ...DEFAULT_SETTINGS.groups, ...(s.groups ?? {}) },
	};
}

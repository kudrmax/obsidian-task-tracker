/** Which pair of neighbouring columns the window shows: Inbox and Soon, Soon and Now, or Now and the calendar. */
export type RightMode = "calendar" | "soon" | "inbox";

/** A height of the hour the timeline settles on after a pinch; the step a drag snaps to follows from the height itself. */
export interface ZoomLevel {
	/** Height of one hour on the timeline, CSS px. */
	readonly hourPx: number;
}

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

/** The fixed set of colours a priority level takes; the order the settings offer them in. */
export const PRIORITY_COLORS = ["red", "orange", "yellow", "green", "teal", "blue"] as const;
export type PriorityColor = (typeof PRIORITY_COLORS)[number];

/** A priority level: a task whose text starts with `prefix` gets the tint of `color`. */
export interface PriorityLevel {
	readonly prefix: string;
	readonly color: PriorityColor;
}

/** A prefix marks a task only when it is one word: a line's first word is matched against it. */
export function usablePrefix(prefix: string): boolean {
	return /^\S+$/.test(prefix);
}

export function sameLevels(a: readonly PriorityLevel[], b: readonly PriorityLevel[]): boolean {
	return a.length === b.length && a.every((level, i) => level.prefix === b[i].prefix && level.color === b[i].color);
}

/** The levels that mark tasks: a one-word prefix, the first of two with the same one. */
export function usableLevels(levels: readonly PriorityLevel[]): readonly PriorityLevel[] {
	return levels.filter((level, i) => usablePrefix(level.prefix) && levels.findIndex((l) => l.prefix === level.prefix) === i);
}

export interface TaskCalendarSettings {
	readonly tasksFile: string;
	readonly sections: SectionNames;
	readonly dueDateMarker: string;
	readonly slotMarker: string;
	readonly workCalendarFile: string;
	/** Calendar titles to take from the work file; empty means all. */
	readonly workCalendarTitles: readonly string[];
	readonly google: GoogleSettings;
	readonly longPressMs: number;
	readonly zoomLevels: readonly ZoomLevel[];
	/** The hour a day other than today scrolls to when opened. */
	readonly scrollToHour: number;
	/** The hour one day ends and the next begins, 0..23: today, the due dates and the timeline count from it. */
	readonly dayStartHour: number;
	/** The left column's share of the width the two columns split, 0..1, set by dragging the divider: the line keeps its place as the window changes. */
	readonly listShare: number;
	/** What the right column shows; the segmented control in the day row sets it. */
	readonly rightMode: RightMode;
	/** A calendar source whose last update is older than this gets the orange dot. */
	readonly staleAfterMinutes: number;
	/** Priority levels in the order the menu and the task screen offer them. */
	readonly priorities: readonly PriorityLevel[];
	/** A task card's height, px: the list, New task and the timeline's stack; its ends are round, half of it. */
	readonly cardHeight: number;
	/** Between two cards, px: in the list and in a stack on the timeline alike. */
	readonly cardGap: number;
}

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
	workCalendarFile: "calendar/work.json",
	workCalendarTitles: [],
	google: { clientId: "", clientSecret: "", refreshToken: "", calendarIds: [], refreshSeconds: 60 },
	longPressMs: 250,
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
	cardHeight: 35,
	cardGap: 2,
};

/** What belongs to the device, not the vault: the divider's place and the column shown are set by hand on each screen, and must not travel through Sync. */
export const DEVICE_KEYS = ["listShare", "rightMode"] as const;
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
	const { listShare: _s, rightMode: _m, ...shared } = settings;
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
	};
}

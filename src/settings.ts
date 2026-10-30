export type RightMode = "calendar" | "soon";

export interface ZoomLevel {
	/** Height of one hour on the timeline, CSS px. */
	readonly hourPx: number;
	/** Drag, resize and drop step at this level, minutes. */
	readonly stepMinutes: number;
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

export interface TaskCalendarSettings {
	readonly tasksFile: string;
	readonly sections: SectionNames;
	readonly dueDateMarker: string;
	readonly slotMarker: string;
	readonly workCalendarFile: string;
	/** Calendar titles to take from the work file; empty means all. */
	readonly workCalendarTitles: readonly string[];
	readonly google: GoogleSettings;
	readonly newTaskMinutes: number;
	readonly longPressMs: number;
	readonly zoomLevels: readonly ZoomLevel[];
	/** The hour a day other than today scrolls to when opened. */
	readonly scrollToHour: number;
	/** The hour one day ends and the next begins, 0..23: today, the due dates and the timeline count from it. */
	readonly dayStartHour: number;
	/** Width of the left column, CSS px, set by dragging the divider. */
	readonly listWidth: number;
	/** What the right column shows; the segmented control in the day row sets it. */
	readonly rightMode: RightMode;
	/** A calendar source whose last update is older than this gets the orange dot. */
	readonly staleAfterMinutes: number;
}

export const LIST_WIDTH_MIN = 110;
export const LIST_WIDTH_MAX = 280;

export const DEFAULT_SETTINGS: TaskCalendarSettings = {
	tasksFile: "TODOs Tasks.md",
	sections: { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" },
	dueDateMarker: "📅",
	slotMarker: "⏰",
	workCalendarFile: "calendar/work.json",
	workCalendarTitles: [],
	google: { clientId: "", clientSecret: "", refreshToken: "", calendarIds: [], refreshSeconds: 60 },
	newTaskMinutes: 60,
	longPressMs: 250,
	zoomLevels: [
		{ hourPx: 28, stepMinutes: 60 },
		{ hourPx: 56, stepMinutes: 30 },
		{ hourPx: 112, stepMinutes: 15 },
		{ hourPx: 224, stepMinutes: 5 },
	],
	scrollToHour: 9,
	dayStartHour: 0,
	listWidth: 187,
	rightMode: "calendar",
	staleAfterMinutes: 180,
};

/** What belongs to the device, not the vault: the divider's place and the column shown are set by hand on each screen, and must not travel through Sync. */
export const DEVICE_KEYS = ["listWidth", "rightMode"] as const;
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
	const { listWidth: _w, rightMode: _m, ...shared } = settings;
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

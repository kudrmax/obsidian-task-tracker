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
	/** Width of the left column, CSS px, set by dragging the divider. */
	readonly listWidth: number;
	/** What the right column shows; the segmented control in the day row sets it. */
	readonly rightMode: RightMode;
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
	listWidth: 187,
	rightMode: "calendar",
};

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

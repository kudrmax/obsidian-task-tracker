import type { GroupSettings } from "./domain/Groups";
import type { LabelLevel } from "./domain/Label";
import type { PriorityLevel } from "./domain/Priority";

export type { GroupSettings } from "./domain/Groups";
export { type LabelLevel, sameLabels, usableLabels } from "./domain/Label";
export { PRIORITY_COLORS, type PriorityColor, type PriorityLevel, sameLevels, usableLevels, usablePrefix } from "./domain/Priority";

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
	/** Google calendar ids once shown (empty: all). Read only to carry the choice over into `hiddenCalendars`. */
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
	/** Stands among the fields of a task whose subtasks are folded away. */
	readonly collapsedMarker: string;
	/** Priority levels in the order the menu and the task screen offer them. */
	readonly priorities: readonly PriorityLevel[];
	/** The tag folder of the labels: a task tagged `#<labelTag>/<name>` has the label of that name. */
	readonly labelTag: string;
	/** Labels in the order the menu offers them and a card of several paints their colours. */
	readonly labels: readonly LabelLevel[];
	readonly groups: GroupSettings;
	/** The hour one day ends and the next begins, 0..23: today, the due dates and the timeline count from it. */
	readonly dayStartHour: number;
}

/** What every frontend's screen does alike: when a touch becomes a drag, and the hour another day opens at. */
export interface ScreenBehaviour {
	readonly longPressMs: number;
	/** The hour a day other than today scrolls to when opened. */
	readonly scrollToHour: number;
}

/** Where the events come from: the work file, Google, and when a source counts as stale. */
export interface SourceSettings {
	readonly workCalendarFile: string;
	/** Calendar titles to take from the work file; empty means all. Read only to carry the choice over into `hiddenCalendars`. */
	readonly workCalendarTitles: readonly string[];
	/** The calendars not shown, by account and title; a calendar not listed is shown, a new one too. */
	readonly hiddenCalendars: readonly { readonly account: string; readonly title: string }[];
	/** The old choice (Google's calendar ids, the work file's titles) has been carried over into `hiddenCalendars`. */
	readonly calendarsMigrated: boolean;
	readonly google: GoogleSettings;
	/** A calendar source whose last update is older than this gets the orange dot. */
	readonly staleAfterMinutes: number;
}

/** How a card of several labels is painted: narrow diagonal stripes of their colours in turn, or one colour flowing into the next. */
export type LabelPaint = "stripes" | "blend";

/** The paints a card of several labels may take, in the order the settings offer them; the first is the default. */
export const LABEL_PAINTS: readonly LabelPaint[] = ["stripes", "blend"];

/** The bounds a card's height and the gap between cards are kept in, px (points on the phone). */
export const CARD_HEIGHTS = { min: 28, max: 40 } as const;
export const CARD_GAPS = { min: 0, max: 10 } as const;
/** A card's height and the gap between cards before the settings say otherwise. */
export const DEFAULT_CARD_SIZE = { height: 35, gap: 2 } as const;

/** A level of the timeline's zoom: the height of one hour, in the frontend's units. */
export interface ZoomLevel {
	readonly hourPx: number;
}

/** The levels a settings file without its own gives: from the whole day to the closest hour. */
export const DEFAULT_ZOOM_LEVELS: readonly ZoomLevel[] = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];

/** How every frontend zooms its timeline alike: the hour's heights a pinch settles between. */
export interface TimelineSettings {
	readonly zoomLevels: readonly ZoomLevel[];
}

/** How every frontend paints a card alike: its labels, its height and the gap to the next. */
export interface CardPaintSettings {
	readonly labelPaint: LabelPaint;
	/** A task card's height: the list, New task and the timeline's stack; its ends are round, half of it. */
	readonly cardHeight: number;
	/** Between two cards: in a list and in a stack on the timeline alike. */
	readonly cardGap: number;
}

/** Which notes are projects. */
export interface ProjectSettings {
	/** A note with exactly this tag, in its properties or its text, is a project: `#project`. */
	readonly projectTag: string;
}

/** The settings every frontend shares: the plugin's data.json holds them, with the TS view's own beside them. */
export type TaskCalendarSettings = FileFormatSettings & ScreenBehaviour & SourceSettings & ProjectSettings & CardPaintSettings & TimelineSettings;

export const DEFAULT_SETTINGS: TaskCalendarSettings = {
	tasksFile: "TODOs Tasks.md",
	sections: { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" },
	dueDateMarker: "📅",
	slotMarker: "⏰",
	alarmSlotMarker: "🚨",
	liveSlotMarker: "📌",
	silentSlotMarker: "🔕",
	repeatMarker: "🔁",
	collapsedMarker: "📁",
	workCalendarFile: "calendar/work.json",
	workCalendarTitles: [],
	hiddenCalendars: [],
	calendarsMigrated: false,
	google: { clientId: "", clientSecret: "", refreshToken: "", calendarIds: [], refreshSeconds: 60 },
	longPressMs: 250,
	scrollToHour: 9,
	dayStartHour: 5,
	staleAfterMinutes: 180,
	priorities: [
		{ prefix: "p1", color: "red" },
		{ prefix: "p2", color: "orange" },
	],
	labelTag: "label",
	labels: [],
	labelPaint: LABEL_PAINTS[0],
	cardHeight: DEFAULT_CARD_SIZE.height,
	cardGap: DEFAULT_CARD_SIZE.gap,
	zoomLevels: DEFAULT_ZOOM_LEVELS,
	projectTag: "#project",
	groups: { presets: ["Morning", "Afternoon", "Evening"], ungrouped: "No section" },
};

/** Merges saved data over the defaults, one level deep for the nested objects. */
export function settingsFrom(saved: unknown): TaskCalendarSettings {
	const s = (saved ?? {}) as Partial<TaskCalendarSettings>;
	return {
		...DEFAULT_SETTINGS,
		...s,
		sections: { ...DEFAULT_SETTINGS.sections, ...(s.sections ?? {}) },
		google: { ...DEFAULT_SETTINGS.google, ...(s.google ?? {}) },
		groups: { ...DEFAULT_SETTINGS.groups, ...(s.groups ?? {}) },
		labelPaint: labelPaintOf(s.labelPaint),
		cardHeight: sizeOf(s.cardHeight, CARD_HEIGHTS, DEFAULT_SETTINGS.cardHeight),
		cardGap: sizeOf(s.cardGap, CARD_GAPS, DEFAULT_SETTINGS.cardGap),
		zoomLevels: zoomLevelsOf(saved),
	};
}

/** A size as saved: a whole number within its bounds, or the default for anything that is no number. */
export function sizeOf(saved: unknown, bounds: { readonly min: number; readonly max: number }, fallback: number): number {
	if (typeof saved !== "number" || !Number.isFinite(saved)) return fallback;
	return Math.min(bounds.max, Math.max(bounds.min, Math.round(saved)));
}

/** A paint as saved: one of the paints, or the default for anything else. */
export function labelPaintOf(saved: unknown): LabelPaint {
	return LABEL_PAINTS.find((paint) => paint === saved) ?? DEFAULT_SETTINGS.labelPaint;
}

/** The levels `data.json` keeps under `zoomLevels`, each only its height; the defaults when it keeps none, or one doesn't read. */
export function zoomLevelsOf(saved: unknown): ZoomLevel[] {
	const kept = saved !== null && typeof saved === "object" ? (saved as { zoomLevels?: unknown }).zoomLevels : undefined;
	if (!Array.isArray(kept) || kept.length === 0) return [...DEFAULT_ZOOM_LEVELS];
	const levels = kept.map((level) => (level !== null && typeof level === "object" ? (level as { hourPx?: unknown }).hourPx : undefined));
	if (!levels.every((hourPx): hourPx is number => typeof hourPx === "number" && Number.isFinite(hourPx) && hourPx > 0)) return [...DEFAULT_ZOOM_LEVELS];
	return levels.map((hourPx) => ({ hourPx }));
}

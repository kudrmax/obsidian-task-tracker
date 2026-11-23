import type { SettingsSchema } from "./infrastructure/PluginSettings";
import { DEFAULT_ZOOM_HOUR, type Zoom } from "../core/application/contracts";
import { settingsFrom, type TaskCalendarSettings } from "../core/settings";

/**
 * The settings of this frontend alone, each set by hand on each screen: the day list's share beside the calendar, the
 * zoom a pinch last settled on, the projects tree's width (null for the design's). They live in the device's own storage,
 * never in data.json, so Sync never carries them (`DEVICE_KEYS`); `DeviceSettings` reads them.
 */
export interface ViewSettings {
	readonly listShare: number;
	readonly zoom: Zoom;
	readonly treeWidth: number | null;
}

const VIEW_DEFAULTS: ViewSettings = { listShare: 0.5, zoom: DEFAULT_ZOOM_HOUR, treeWidth: null };

const DEVICE_KEYS = ["listShare", "zoom", "treeWidth"] as const satisfies readonly (keyof ViewSettings)[];

/** The view's settings of what was saved, the defaults for any it lacks. */
export function viewSettingsFrom(saved: unknown): ViewSettings {
	const s = (saved ?? {}) as Partial<Record<keyof ViewSettings, unknown>>;
	return Object.fromEntries(DEVICE_KEYS.map((key) => [key, s[key] ?? VIEW_DEFAULTS[key]])) as unknown as ViewSettings;
}

/** data.json and the device's part of it: the settings every frontend shares and this view's own, one object. */
export type StoredSettings = TaskCalendarSettings & ViewSettings;

/** The keys in the order data.json has always written them: an old file is written back as it was. */
const FILE_ORDER: readonly (keyof StoredSettings)[] = [
	"tasksFile",
	"sections",
	"dueDateMarker",
	"slotMarker",
	"alarmSlotMarker",
	"liveSlotMarker",
	"silentSlotMarker",
	"repeatMarker",
	"collapsedMarker",
	"workCalendarFile",
	"workCalendarTitles",
	"hiddenCalendars",
	"calendarsMigrated",
	"google",
	"longPressMs",
	"zoom",
	"zoomLevels",
	"scrollToHour",
	"dayStartHour",
	"listShare",
	"staleAfterMinutes",
	"priorities",
	"labelTag",
	"labels",
	"labelPaint",
	"groups",
	"cardHeight",
	"cardGap",
	"projectTag",
	"resultMark",
	"assistant",
];

/** The saved object over the defaults of both parts, the keys in the file's order and any unknown one after them. */
export function storedSettingsFrom(saved: unknown): StoredSettings {
	const merged: Record<string, unknown> = { ...settingsFrom(saved), ...viewSettingsFrom(saved) };
	const ordered: Record<string, unknown> = {};
	for (const key of FILE_ORDER) ordered[key] = merged[key];
	for (const [key, value] of Object.entries(merged)) if (!(key in ordered)) ordered[key] = value;
	return ordered as unknown as StoredSettings;
}

export const SETTINGS_FILE: SettingsSchema<StoredSettings> = { from: storedSettingsFrom, device: DEVICE_KEYS };

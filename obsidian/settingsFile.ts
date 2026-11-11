import type { SettingsSchema } from "./infrastructure/PluginSettings";
import { settingsFrom, type TaskCalendarSettings } from "../core/settings";
import { DEVICE_KEYS, type ViewSettings, viewSettingsFrom } from "./ui/viewSettings";

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
	"rightMode",
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

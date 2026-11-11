import { DayBoundary } from "../domain/DayBoundary";
import { normalize } from "../domain/normalize";
import { usablePresets } from "../domain/operations";
import type { LocalDate } from "../domain/Task";
import { TaskDocument } from "../domain/TaskDocument";
import type { Markers } from "../domain/TaskLine";
import { type TaskCalendarSettings, usableLabels, usableLevels, usableResultMark } from "../settings";

/** How the tasks file is read under these settings: one pipeline for the plugin's service and the phone. */
export function markersOf(settings: TaskCalendarSettings): Markers {
	const priorities = usableLevels(settings.priorities).map((l) => l.prefix);
	return {
		dueDate: settings.dueDateMarker,
		slot: settings.slotMarker,
		alarmSlot: settings.alarmSlotMarker,
		liveSlot: settings.liveSlotMarker,
		silentSlot: settings.silentSlotMarker,
		repeat: settings.repeatMarker,
		collapsed: settings.collapsedMarker,
		priorities,
		result: usableResultMark(settings.resultMark, priorities) ?? undefined,
		labelTag: settings.labelTag,
		labels: usableLabels(settings.labels).map((l) => l.name),
	};
}

/** The tasks file, by path from the vault folder: the setting as saved, its default when it was never set; none when it is blank. */
export function tasksFilePath(settings: TaskCalendarSettings): string | null {
	return settings.tasksFile.trim() === "" ? null : settings.tasksFile;
}

export function boundaryOf(settings: TaskCalendarSettings): DayBoundary {
	return new DayBoundary(settings.dayStartHour);
}

export function sectionNames(settings: TaskCalendarSettings): readonly string[] {
	const s = settings.sections;
	return [s.inbox, s.now, s.soon, s.backlog, s.done];
}

export function parseText(text: string, settings: TaskCalendarSettings): TaskDocument {
	const s = settings.sections;
	return TaskDocument.parse(
		text,
		{ inbox: s.inbox, backlog: s.backlog, now: s.now, soon: s.soon, done: s.done, ungrouped: settings.groups.ungrouped },
		markersOf(settings),
	);
}

/** Parsed, with every section, normalized for `today`. */
export function readDocument(text: string, settings: TaskCalendarSettings, today: LocalDate, boundary = boundaryOf(settings)): TaskDocument {
	return normalize(parseText(text, settings).ensureSections(sectionNames(settings)), today, boundary, usablePresets(settings.groups.presets));
}

/**
 * What of the settings the file is read by: its names, its preset sections and its marks. The service keeps what it read
 * while this stays; the screen reads the file anew when it changes. The hour the day starts at is the day, not the reading.
 */
export function readingKey(settings: TaskCalendarSettings): string {
	return JSON.stringify([settings.sections, settings.groups.ungrouped, settings.groups.presets, markersOf(settings)]);
}

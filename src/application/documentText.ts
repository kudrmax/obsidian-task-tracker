import { DayBoundary } from "../domain/DayBoundary";
import { normalize } from "../domain/normalize";
import { usablePresets } from "../domain/operations";
import type { LocalDate } from "../domain/Task";
import { TaskDocument } from "../domain/TaskDocument";
import type { Markers } from "../domain/TaskLine";
import { type TaskCalendarSettings, usableLevels } from "../settings";

/** How the tasks file is read under these settings: one pipeline for the plugin's service and the phone. */
export function markersOf(settings: TaskCalendarSettings): Markers {
	return {
		dueDate: settings.dueDateMarker,
		slot: settings.slotMarker,
		alarmSlot: settings.alarmSlotMarker,
		silentSlot: settings.silentSlotMarker,
		priorities: usableLevels(settings.priorities).map((l) => l.prefix),
	};
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

/** The text after `op`, as the service would write it at `now`. */
export function applyOperation(
	text: string,
	settings: TaskCalendarSettings,
	now: Date,
	op: (doc: TaskDocument, today: LocalDate, boundary: DayBoundary) => TaskDocument,
): string {
	const boundary = boundaryOf(settings);
	const today = boundary.dayOf(now);
	const doc = readDocument(text, settings, today, boundary);
	return normalize(op(doc, today, boundary), today, boundary, usablePresets(settings.groups.presets)).serialize();
}

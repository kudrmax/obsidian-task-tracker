import { settingsFrom, type TaskCalendarSettings } from "../settings";
import { GOOGLE_CALENDAR_FILE, onlyCalendars, readCalendarFile } from "./calendarFile";
import type { CalendarSource } from "./contracts";

/** A meeting with a time, as the phone sees it: one the calendar on screen shows too. */
export interface PhoneMeeting {
	readonly title: string;
	readonly start: Date;
	readonly end: Date;
}

/** The calendars' files the phone app reads, and the meetings in them: the same files and filters as the calendar's. */
export class PhoneMeetingService {
	private readonly settings: TaskCalendarSettings;

	constructor(settingsJson: string) {
		this.settings = settingsFrom(settingsJson.trim() === "" ? null : JSON.parse(settingsJson));
	}

	/** The files' paths in the vault, in the order `between` takes their texts. */
	files(): string[] {
		return this.sources().map((s) => s.path);
	}

	/** The timed meetings that overlap `from`–`to`; a file missing (`null`) or unreadable adds none. */
	between(texts: readonly (string | null)[], from: Date, to: Date): PhoneMeeting[] {
		return this.sources()
			.flatMap((source, i) => {
				const text = texts[i];
				if (text === null || text === undefined) return [];
				try {
					return onlyCalendars(readCalendarFile(text, source.name), source.calendars).events;
				} catch {
					return [];
				}
			})
			.filter((e) => !e.allDay && e.start < to && e.end > from)
			.sort((a, b) => a.start.getTime() - b.start.getTime())
			.map((e) => ({ title: e.title, start: e.start, end: e.end }));
	}

	private sources(): { readonly name: CalendarSource; readonly path: string; readonly calendars: readonly string[] }[] {
		return [
			{ name: "google", path: GOOGLE_CALENDAR_FILE, calendars: [] },
			{ name: "work", path: this.settings.workCalendarFile, calendars: this.settings.workCalendarTitles },
		];
	}
}

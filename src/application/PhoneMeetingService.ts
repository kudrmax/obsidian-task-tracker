import { settingsFrom, type TaskCalendarSettings } from "../settings";
import { CalendarChoice } from "./calendarChoice";
import { type CalendarFile, GOOGLE_CALENDAR_FILE, IPHONE_CALENDAR_FILE, readCalendarFile } from "./calendarFile";
import { hiddenNow } from "./calendarMigration";
import type { CalendarSource } from "./contracts";

const MINUTE_MS = 60_000;

/** A meeting with a time, as the phone sees it: one the calendar on screen shows too. */
export interface PhoneMeeting {
	readonly title: string;
	readonly start: Date;
	readonly end: Date;
}

/** The writers' files the phone app reads, and the meetings in them: the same choice of files and calendars as the calendar's. */
export class PhoneMeetingService {
	private readonly settings: TaskCalendarSettings;

	constructor(settingsJson: string) {
		this.settings = settingsFrom(settingsJson.trim() === "" ? null : JSON.parse(settingsJson));
	}

	/** The files' paths in the vault, in the order `between` takes their texts. */
	files(): string[] {
		return this.sources().map((s) => s.path);
	}

	/** The timed meetings that overlap `from`–`to`, chosen day by day; a file missing (`null`) or unreadable adds none. */
	between(texts: readonly (string | null)[], from: Date, to: Date, now: Date): PhoneMeeting[] {
		const files = new Map<CalendarSource, CalendarFile>();
		this.sources().forEach((source, i) => {
			const text = texts[i];
			if (text === null || text === undefined) return;
			try {
				files.set(source.name, readCalendarFile(text, source.name));
			} catch {
				// A broken file is no file.
			}
		});
		const known = new CalendarChoice(files, [], this.settings.staleAfterMinutes * MINUTE_MS, now).known();
		const choice = new CalendarChoice(files, hiddenNow(this.settings, known, files.get("google")), this.settings.staleAfterMinutes * MINUTE_MS, now);
		const found = new Map<string, PhoneMeeting>();
		for (let day = new Date(from.getFullYear(), from.getMonth(), from.getDate()); day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
			const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
			const start = day < from ? from : day;
			for (const e of choice.day(start, next < to ? next : to).events) {
				if (!e.allDay && !found.has(e.id)) found.set(e.id, { title: e.title, start: e.start, end: e.end });
			}
		}
		return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
	}

	private sources(): { readonly name: CalendarSource; readonly path: string }[] {
		return [
			{ name: "google", path: GOOGLE_CALENDAR_FILE },
			{ name: "iphone", path: IPHONE_CALENDAR_FILE },
			{ name: "work", path: this.settings.workCalendarFile },
		];
	}
}

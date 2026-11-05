import type { CalendarEvent, CalendarSource } from "./contracts";

/** Where the Google events live in the vault: the plugin writes them there from the Calendar API. */
export const GOOGLE_CALENDAR_FILE = "calendar/google.json";

/** The colour of an event whose calendar gave none. */
const DEFAULT_COLOR: Readonly<Record<CalendarSource, string>> = { google: "#4285F4", work: "#0A84FF" };

interface FileEvent {
	id: string;
	title: string;
	start: string;
	end: string;
	allDay: boolean;
	calendar: string;
	color?: string | null;
}

interface FileContent {
	exportedAt: string;
	device?: string;
	events?: FileEvent[];
}

/** One calendar's file as read: its events and when and where it was written. */
export interface CalendarFile {
	readonly events: readonly CalendarEvent[];
	readonly exportedAt: Date;
	readonly device: string | null;
}

/**
 * A calendar's events in the vault: the one place they are true. Scriptable writes the work calendar's, the plugin
 * Google's; the calendar on screen and the iPhone's reminders read them, never the calendars themselves.
 * `calendars` keeps only the events of the calendars named, case aside; none named keeps all.
 */
export function readCalendarFile(text: string, source: CalendarSource, calendars: readonly string[] = []): CalendarFile {
	const content = JSON.parse(text) as FileContent;
	const wanted = calendars.map((c) => c.trim().toLowerCase()).filter((c) => c !== "");
	const events = (content.events ?? [])
		.filter((e) => wanted.length === 0 || wanted.includes(e.calendar.toLowerCase()))
		.map((e) => ({
			id: e.id,
			title: e.title,
			start: new Date(e.start),
			end: new Date(e.end),
			allDay: e.allDay,
			calendar: e.calendar,
			color: e.color ?? DEFAULT_COLOR[source],
			source,
		}));
	return { events, exportedAt: new Date(content.exportedAt), device: content.device ?? null };
}

/** The file's text for `events`, in the format Scriptable writes the work calendar in. */
export function calendarFileText(events: readonly CalendarEvent[], exportedAt: Date, device: string): string {
	const content: FileContent = {
		exportedAt: exportedAt.toISOString(),
		device,
		events: events.map((e) => ({
			id: e.id,
			title: e.title,
			start: e.start.toISOString(),
			end: e.end.toISOString(),
			allDay: e.allDay,
			calendar: e.calendar,
			color: e.color,
		})),
	};
	return `${JSON.stringify(content, null, "\t")}\n`;
}

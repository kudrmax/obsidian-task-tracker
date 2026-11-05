import type { CalendarEvent, CalendarSource } from "./contracts";

/** Where the Google events live in the vault: the plugin writes them there from the Calendar API. */
export const GOOGLE_CALENDAR_FILE = "calendar/google.json";

/** Where the iPhone app writes the phone's calendars. */
export const IPHONE_CALENDAR_FILE = "calendar/iphone.json";

/** The colour of an event whose calendar gave none. */
const DEFAULT_COLOR: Readonly<Record<CalendarSource, string>> = { google: "#4285F4", iphone: "#0A84FF", work: "#0A84FF" };

interface FileEvent {
	id: string;
	title: string;
	start: string;
	end: string;
	allDay: boolean;
	calendar: string;
	calendarId?: string | null;
	account?: string | null;
	color?: string | null;
}

interface FileCalendarRow {
	calendar: string;
	calendarId?: string | null;
	account?: string | null;
	color?: string | null;
}

interface FileContent {
	exportedAt: string;
	device?: string | null;
	from?: string | null;
	to?: string | null;
	validUntil?: string | null;
	calendars?: FileCalendarRow[];
	events?: FileEvent[];
}

/** A calendar a writer saw, with or without events in its window. */
export interface FileCalendar {
	readonly title: string;
	readonly account: string | null;
	readonly calendarId: string | null;
	readonly color: string | null;
}

/** One writer's file as read: every calendar it saw, their events, and when, where and for which days it was written. */
export interface CalendarFile {
	readonly events: readonly CalendarEvent[];
	readonly calendars: readonly FileCalendar[];
	readonly exportedAt: Date;
	readonly device: string | null;
	/** The days the file covers; null when the file does not say (Scriptable before it learnt to). */
	readonly from: Date | null;
	readonly to: Date | null;
	/** The iPhone app's signature runs out then; null for the other writers. */
	readonly validUntil: Date | null;
}

const dateOrNull = (text: string | null | undefined): Date | null => (text ? new Date(text) : null);

/**
 * A writer's events in the vault: the one place they are true. Each writer keeps its own file and lists every calendar
 * it sees; which calendar comes from which file, and which are shown, is decided when reading (`calendarChoice`).
 */
export function readCalendarFile(text: string, source: CalendarSource): CalendarFile {
	const content = JSON.parse(text) as FileContent;
	const events = (content.events ?? []).map((e) => ({
		id: e.id,
		title: e.title,
		start: new Date(e.start),
		end: new Date(e.end),
		allDay: e.allDay,
		calendar: e.calendar,
		color: e.color ?? DEFAULT_COLOR[source],
		source,
		account: e.account ?? null,
		calendarId: e.calendarId ?? null,
	}));
	const listed = content.calendars ?? eventCalendars(content.events ?? []);
	return {
		events,
		calendars: listed.map((c) => ({ title: c.calendar, account: c.account ?? null, calendarId: c.calendarId ?? null, color: c.color ?? null })),
		exportedAt: new Date(content.exportedAt),
		device: content.device ?? null,
		from: dateOrNull(content.from),
		to: dateOrNull(content.to),
		validUntil: dateOrNull(content.validUntil),
	};
}

/** A file from before the calendars were listed: the calendars of its events, each once. */
function eventCalendars(events: readonly FileEvent[]): FileCalendarRow[] {
	const seen = new Map<string, FileCalendarRow>();
	for (const e of events) {
		const key = `${e.account ?? ""}\n${e.calendarId ?? ""}\n${e.calendar}`;
		if (!seen.has(key)) seen.set(key, { calendar: e.calendar, calendarId: e.calendarId ?? null, account: e.account ?? null, color: e.color ?? null });
	}
	return [...seen.values()];
}

/** The file's text, in the format every writer uses. */
export function calendarFileText(file: Omit<CalendarFile, "device"> & { readonly device: string | null }): string {
	const iso = (d: Date | null) => (d ? d.toISOString() : null);
	const content: FileContent = {
		exportedAt: file.exportedAt.toISOString(),
		device: file.device,
		from: iso(file.from),
		to: iso(file.to),
		validUntil: iso(file.validUntil),
		calendars: file.calendars.map((c) => ({ calendar: c.title, calendarId: c.calendarId, account: c.account, color: c.color })),
		events: file.events.map((e) => ({
			id: e.id,
			title: e.title,
			start: e.start.toISOString(),
			end: e.end.toISOString(),
			allDay: e.allDay,
			calendar: e.calendar,
			calendarId: e.calendarId,
			account: e.account,
			color: e.color,
		})),
	};
	return `${JSON.stringify(content, null, "\t")}\n`;
}

/** Only the calendars named, case aside; none named keeps all. The work file's titles setting, until the calendars are chosen per calendar. */
export function onlyCalendars(file: CalendarFile, titles: readonly string[]): CalendarFile {
	const wanted = titles.map((t) => t.trim().toLowerCase()).filter((t) => t !== "");
	if (wanted.length === 0) return file;
	const kept = (title: string) => wanted.includes(title.toLowerCase());
	return { ...file, events: file.events.filter((e) => kept(e.calendar)), calendars: file.calendars.filter((c) => kept(c.title)) };
}

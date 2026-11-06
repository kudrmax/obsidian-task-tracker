import type { CalendarEvent, CalendarSource } from "./contracts";
import type { TaskCalendarSettings } from "../settings";

/** Where the Google events live in the vault: the plugin writes them there from the Calendar API. */
export const GOOGLE_CALENDAR_FILE = "calendar/google.json";

/** Where the iPhone app writes the phone's calendars. */
export const IPHONE_CALENDAR_FILE = "calendar/iphone.json";

/** The calendars' files, in the order the calendar reads them: Google's, the iPhone app's, the work calendar's. */
export const CALENDAR_SOURCES: readonly CalendarSource[] = ["google", "iphone", "work"];

/** Where a calendar's file is in the vault: the work calendar's at the settings' path. */
export function calendarPath(source: CalendarSource, settings: TaskCalendarSettings): string {
	if (source === "google") return GOOGLE_CALENDAR_FILE;
	if (source === "iphone") return IPHONE_CALENDAR_FILE;
	return settings.workCalendarFile;
}

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
	sourceId?: string | null;
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
	/** The phone's own id of the account (two accounts may share a title, «Gmail»); absent elsewhere. */
	readonly sourceId?: string | null;
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
		calendars: listed.map((c) => ({ title: c.calendar, account: c.account ?? null, calendarId: c.calendarId ?? null, color: c.color ?? null, ...(c.sourceId ? { sourceId: c.sourceId } : {}) })),
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
/** An event as a writer writes it: a phone's calendar may have no colour of its own. */
type WrittenEvent = Omit<CalendarEvent, "color" | "source"> & { readonly color: string | null };

export function calendarFileText(file: Omit<CalendarFile, "device" | "events"> & { readonly device: string | null; readonly events: readonly WrittenEvent[] }): string {
	const iso = (d: Date | null) => (d ? d.toISOString() : null);
	const content: FileContent = {
		exportedAt: file.exportedAt.toISOString(),
		device: file.device,
		from: iso(file.from),
		to: iso(file.to),
		validUntil: iso(file.validUntil),
		calendars: file.calendars.map((c) => ({ calendar: c.title, calendarId: c.calendarId, account: c.account, color: c.color, ...(c.sourceId ? { sourceId: c.sourceId } : {}) })),
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


/** A calendar of the phone as the iOS app hands it to `phoneCalendarText`. */
export interface PhoneCalendar {
	readonly title: string;
	readonly calendarId: string;
	readonly account: string;
	readonly color?: string | null;
	/** The account's own id: two accounts may share a title («Gmail»). */
	readonly sourceId?: string | null;
}

/** An event of the phone as the iOS app hands it to `phoneCalendarText`: times in epoch ms, its calendar by id. */
export interface PhoneEvent {
	readonly id: string;
	readonly title: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly allDay: boolean;
	readonly calendarId: string;
}

export interface PhoneExport {
	readonly calendars: readonly PhoneCalendar[];
	readonly events: readonly PhoneEvent[];
	readonly fromMs: number;
	readonly toMs: number;
	readonly exportedAtMs: number;
	readonly device: string;
	readonly validUntilMs?: number | null;
}

/** `calendar/iphone.json`'s text for the phone's calendars and events: each event named by its calendar, the first of two with one id. */
export function phoneCalendarText(file: PhoneExport): string {
	const byId = new Map<string, PhoneCalendar>();
	for (const c of file.calendars) if (!byId.has(c.calendarId)) byId.set(c.calendarId, c);
	return calendarFileText({
		exportedAt: new Date(file.exportedAtMs),
		device: file.device,
		from: new Date(file.fromMs),
		to: new Date(file.toMs),
		validUntil: file.validUntilMs === null || file.validUntilMs === undefined ? null : new Date(file.validUntilMs),
		calendars: file.calendars.map((c) => ({ title: c.title, calendarId: c.calendarId, account: c.account, color: c.color ?? null, ...(c.sourceId ? { sourceId: c.sourceId } : {}) })),
		events: file.events.map((e) => {
			const calendar = byId.get(e.calendarId);
			return {
				id: e.id,
				title: e.title,
				start: new Date(e.startMs),
				end: new Date(e.endMs),
				allDay: e.allDay,
				calendar: calendar?.title ?? "",
				calendarId: e.calendarId,
				account: calendar?.account ?? null,
				color: calendar?.color ?? null,
			};
		}),
	});
}

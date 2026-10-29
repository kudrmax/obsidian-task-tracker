import { requestUrl } from "obsidian";
import type { CalendarEvent } from "../application/contracts";
import type { EventBatch, EventSource } from "../application/EventSource";
import type { SettingsStore } from "../application/ports";
import type { GoogleAuth } from "./GoogleAuth";

const API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_COLOR = "#4285F4";
const UNTITLED = "(untitled)";

export interface GoogleCalendarInfo {
	readonly id: string;
	readonly title: string;
	readonly color: string;
}

interface CalendarListEntry {
	id: string;
	summary: string;
	backgroundColor?: string;
	selected?: boolean;
}

interface GoogleEvent {
	id: string;
	summary?: string;
	status?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
}

function dateOf(point: { dateTime?: string; date?: string }): Date {
	if (point.dateTime) return new Date(point.dateTime);
	const [y, m, d] = (point.date ?? "1970-01-01").split("-").map(Number);
	return new Date(y, m - 1, d);
}

export class GoogleCalendarSource implements EventSource {
	readonly name = "google" as const;

	constructor(
		private readonly auth: GoogleAuth,
		private readonly settings: SettingsStore,
	) {}

	async eventsBetween(start: Date, end: Date): Promise<EventBatch> {
		if (!this.auth.isLoggedIn()) throw new Error("not logged in");
		const wanted = this.settings.get().google.calendarIds;
		const calendars = (await this.calendarList()).filter((c) => c.selected !== false && (wanted.length === 0 || wanted.includes(c.id)));
		const perCalendar = await Promise.all(calendars.map((c) => this.eventsOf(c, start, end)));
		return { events: perCalendar.flat(), updatedAt: new Date() };
	}

	async listCalendars(): Promise<GoogleCalendarInfo[]> {
		return (await this.calendarList()).map((c) => ({ id: c.id, title: c.summary, color: c.backgroundColor ?? DEFAULT_COLOR }));
	}

	private async calendarList(): Promise<CalendarListEntry[]> {
		const data = await this.get<{ items?: CalendarListEntry[] }>(`${API}/users/me/calendarList`, {});
		return data.items ?? [];
	}

	private async eventsOf(calendar: CalendarListEntry, start: Date, end: Date): Promise<CalendarEvent[]> {
		const data = await this.get<{ items?: GoogleEvent[] }>(`${API}/calendars/${encodeURIComponent(calendar.id)}/events`, {
			timeMin: start.toISOString(),
			timeMax: end.toISOString(),
			singleEvents: "true",
			orderBy: "startTime",
			maxResults: "250",
		});
		return (data.items ?? [])
			.filter((e) => e.status !== "cancelled")
			.map((e) => ({
				id: `google:${calendar.id}:${e.id}`,
				title: e.summary ?? UNTITLED,
				start: dateOf(e.start),
				end: dateOf(e.end),
				allDay: !e.start.dateTime,
				calendar: calendar.summary,
				color: calendar.backgroundColor ?? DEFAULT_COLOR,
				source: "google",
			}));
	}

	private async get<T>(url: string, params: Record<string, string>): Promise<T> {
		const query = new URLSearchParams(params).toString();
		const res = await requestUrl({
			url: query ? `${url}?${query}` : url,
			headers: { Authorization: `Bearer ${await this.auth.accessToken()}` },
			throw: false,
		});
		if (res.status >= 400) throw new Error(`Google API ${res.status}: ${res.text}`);
		return res.json as T;
	}
}

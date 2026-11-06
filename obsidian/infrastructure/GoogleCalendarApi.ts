import type { FileCalendar } from "../../core/application/calendarFile";
import type { CalendarEvent } from "../../core/application/contracts";
import { SourceProblemError } from "../../core/application/EventSource";
import type { Clock, SettingsStore } from "../../core/application/ports";
import type { GoogleAuth } from "./GoogleAuth";
import type { Http } from "./Http";

const API = "https://www.googleapis.com/calendar/v3";
/** How long the list of calendars is taken as it is: it changes when a calendar is added in Google, rarely. */
const LIST_KEPT_MS = 30 * 60_000;
const PAGE_SIZE = "250";
const UNTITLED = "(untitled)";

interface CalendarListEntry {
	id: string;
	summary: string;
	backgroundColor?: string;
	primary?: boolean;
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

/** What the account holds for a span: its email, every calendar, their events. */
export interface GoogleExport {
	readonly account: string;
	readonly calendars: FileCalendar[];
	readonly events: CalendarEvent[];
}

/** Google's Calendar API, read only: every calendar of the account and their events, whichever the settings show. */
export class GoogleCalendarApi {
	private list: { readonly key: string; readonly at: number; readonly calendars: Promise<CalendarListEntry[]> } | null = null;

	constructor(
		private readonly auth: Pick<GoogleAuth, "isLoggedIn" | "accessToken">,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
		private readonly http: Http,
	) {}

	async export(start: Date, end: Date): Promise<GoogleExport> {
		if (!this.auth.isLoggedIn()) throw new SourceProblemError({ kind: "loggedOut" }, "not logged in");
		const list = await this.calendarList();
		const account = list.find((c) => c.primary)?.id ?? list[0]?.id ?? "";
		try {
			const perCalendar = await Promise.all(list.map((c) => this.eventsOf(c, account, start, end)));
			const calendars = list.map((c) => ({ title: c.summary, account, calendarId: c.id, color: c.backgroundColor ?? null }));
			return { account, calendars, events: perCalendar.flat() };
		} catch (e) {
			// A calendar removed in Google answers 404: the list is asked again, not kept failing for half an hour.
			this.list = null;
			throw e;
		}
	}

	/** Kept per login for LIST_KEPT_MS; fetches at once share one request. */
	private calendarList(): Promise<CalendarListEntry[]> {
		const { clientId, refreshToken } = this.settings.get().google;
		const key = JSON.stringify([clientId, refreshToken]);
		const now = this.clock.now().getTime();
		if (this.list && this.list.key === key && now - this.list.at < LIST_KEPT_MS) return this.list.calendars;
		const calendars = this.get<{ items?: CalendarListEntry[] }>(`${API}/users/me/calendarList`, {}).then((data) => data.items ?? []);
		const list = { key, at: now, calendars };
		this.list = list;
		calendars.catch(() => {
			if (this.list === list) this.list = null;
		});
		return calendars;
	}

	private async eventsOf(calendar: CalendarListEntry, account: string, start: Date, end: Date): Promise<CalendarEvent[]> {
		const items: GoogleEvent[] = [];
		let pageToken: string | undefined;
		do {
			const data = await this.get<{ items?: GoogleEvent[]; nextPageToken?: string }>(`${API}/calendars/${encodeURIComponent(calendar.id)}/events`, {
				timeMin: start.toISOString(),
				timeMax: end.toISOString(),
				singleEvents: "true",
				orderBy: "startTime",
				maxResults: PAGE_SIZE,
				...(pageToken ? { pageToken } : {}),
			});
			items.push(...(data.items ?? []));
			pageToken = data.nextPageToken;
		} while (pageToken);
		return items
			.filter((e) => e.status !== "cancelled")
			.map((e) => ({
				id: `google:${calendar.id}:${e.id}`,
				title: e.summary ?? UNTITLED,
				start: dateOf(e.start),
				end: dateOf(e.end),
				allDay: !e.start.dateTime,
				calendar: calendar.summary,
				color: calendar.backgroundColor ?? null,
				source: "google",
				account,
				calendarId: calendar.id,
			}));
	}

	private async get<T>(url: string, params: Record<string, string>): Promise<T> {
		const query = new URLSearchParams(params).toString();
		const res = await this.http({
			url: query ? `${url}?${query}` : url,
			headers: { Authorization: `Bearer ${await this.auth.accessToken()}` },
		});
		if (res.status >= 400) throw new Error(`Google API ${res.status}: ${res.text}`);
		return res.json as T;
	}
}

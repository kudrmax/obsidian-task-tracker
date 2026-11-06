import { calendarFileText, type FileCalendar, GOOGLE_CALENDAR_FILE, readCalendarFile } from "../application/calendarFile";
import type { CalendarEvent } from "../application/contracts";
import { type EventFeed, SourceProblemError } from "../application/EventSource";
import type { Clock, SettingsStore } from "../application/ports";
import type { GoogleAuth } from "./GoogleAuth";
import type { GoogleCalendarApi } from "./GoogleCalendarApi";

/** The days the file holds: a month back for the days looked back at, three months ahead for planning. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 90;
/** With no news the file is written again only to say it is still fresh, and at most this often: Sync carries every write. */
const FRESH_STEP_MS = 10 * 60_000;
const DEVICE = "Google";

export interface FeedAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, text: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

function daysFrom(now: Date, days: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
}

/** The events alone, as the file writes them: two lists that give the same text are the same. */
function eventsText(events: readonly CalendarEvent[]): string {
	return JSON.stringify(events);
}

/**
 * Brings the shown Google calendars into `calendar/google.json`: every device the plugin runs on asks the API and
 * writes what it got, and Sync carries the file to the rest. Logged out, the file is emptied.
 */
export class GoogleCalendarFeed implements EventFeed {
	readonly name = "google" as const;
	/** The last successful run: when, and under which settings. */
	private last: { readonly at: number; readonly key: string } | null = null;

	constructor(
		private readonly api: Pick<GoogleCalendarApi, "export">,
		private readonly auth: Pick<GoogleAuth, "isLoggedIn">,
		private readonly adapter: FeedAdapter,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
		private readonly path = GOOGLE_CALENDAR_FILE,
	) {}

	async refresh(force: boolean): Promise<void> {
		const key = this.key();
		const now = this.clock.now();
		if (!force && this.fresh(key, now)) return;
		const from = daysFrom(now, -PAST_DAYS);
		const to = daysFrom(now, FUTURE_DAYS + 1);
		if (!this.auth.isLoggedIn()) {
			if (await this.adapter.exists(this.path)) await this.write([], [], now, from, to);
			throw new SourceProblemError({ kind: "loggedOut" }, "not logged in");
		}
		const exported = await this.api.export(from, to);
		await this.write(exported.calendars, exported.events, now, from, to);
		this.last = { at: now.getTime(), key };
	}

	private fresh(key: string, now: Date): boolean {
		const seconds = this.settings.get().google.refreshSeconds;
		if (seconds <= 0 || !this.last || this.last.key !== key) return false;
		return now.getTime() - this.last.at < seconds * 1000;
	}

	/** The settings the file's events depend on: written under others, it is not fresh. */
	private key(): string {
		const { clientId, refreshToken } = this.settings.get().google;
		return JSON.stringify([clientId, refreshToken]);
	}

	private async write(calendars: readonly FileCalendar[], events: readonly CalendarEvent[], now: Date, from: Date, to: Date): Promise<void> {
		const before = await this.current();
		const same = before && eventsText(before.events) === eventsText(events) && JSON.stringify(before.calendars) === JSON.stringify(calendars);
		if (same && now.getTime() - before.exportedAt.getTime() < FRESH_STEP_MS) return;
		const folder = this.path.split("/").slice(0, -1).join("/");
		if (folder !== "" && !(await this.adapter.exists(folder))) await this.adapter.mkdir(folder);
		await this.adapter.write(this.path, calendarFileText({ events, calendars, exportedAt: now, device: DEVICE, from, to, validUntil: null }));
	}

	/** The file as it is; one that does not parse counts as none and is written over. */
	private async current(): Promise<{ readonly events: readonly CalendarEvent[]; readonly calendars: readonly FileCalendar[]; readonly exportedAt: Date } | null> {
		if (!(await this.adapter.exists(this.path))) return null;
		try {
			return readCalendarFile(await this.adapter.read(this.path), "google");
		} catch {
			return null;
		}
	}
}

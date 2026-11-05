import type { LocalDate } from "../domain/Task";
import type { TaskCalendarSettings } from "../settings";
import type { CalendarOption, DayEvents } from "./contracts";

/** The tasks file as text. Implemented over the Obsidian vault; in tests, in memory. */
export interface TaskFileStore {
	/** null when the file does not exist. */
	read(): Promise<string | null>;
	/** Atomic read-modify-write (vault.process). `fn` gets the current text and returns the new one. */
	write(fn: (text: string) => string): Promise<void>;
	create(text: string): Promise<void>;
	/**
	 * Fires once for every change of the file: a write (this plugin's own included), its creation, deletion or a rename to or
	 * from its path. The one source of change notifications. Returns the unsubscribe.
	 */
	onChange(listener: () => void): () => void;
}

export interface Clock {
	now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Runs `tick` every `ms` until the returned stop is called. */
export interface Ticker {
	every(ms: number, tick: () => void): () => void;
}

/** One-shot timers: the window's in the plugin, fakes in tests. */
export interface Timers {
	set(fn: () => void, ms: number): number;
	clear(id: number): void;
}

/** Settings as the UI and the services see them; `update` persists to data.json. */
export interface SettingsStore {
	get(): TaskCalendarSettings;
	update(patch: Partial<TaskCalendarSettings>): Promise<void>;
	/** Fires after the settings changed, here or through Sync. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/** The events last fetched for each day, kept on the device across restarts: the calendar opens with them before the network answers. */
export interface EventCache {
	read(): ReadonlyMap<LocalDate, DayEvents>;
	write(days: ReadonlyMap<LocalDate, DayEvents>): void;
}

/** Google's login: the refresh token kept in the settings. Implemented by GoogleAuth. */
export interface GoogleLogin {
	isLoggedIn(): boolean;
	login(): Promise<string>;
	logout(): Promise<void>;
}

/** The calendars of the Google account logged in, asked afresh. Implemented by GoogleCalendarSource. */
export interface GoogleCalendarList {
	listCalendars(): Promise<readonly CalendarOption[]>;
}

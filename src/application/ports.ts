import type { LocalDate } from "../domain/Task";
import type { TaskCalendarSettings } from "../settings";
import type { CalendarEvent, CalendarOption, SourceStatus } from "./contracts";

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

/** A source's status as the calendar service keeps it, in memory and on the device: its kind follows from the source. */
export type KeptStatus = Omit<SourceStatus, "kind">;

/** A day's events as the calendar service keeps them. */
export interface KeptDay {
	readonly events: readonly CalendarEvent[];
	readonly statuses: readonly KeptStatus[];
}

/** The events last fetched for each day, kept on the device across restarts: the calendar opens with them before the network answers. */
export interface EventCache {
	read(): ReadonlyMap<LocalDate, KeptDay>;
	write(days: ReadonlyMap<LocalDate, KeptDay>): void;
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

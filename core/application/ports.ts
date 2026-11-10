import type { TaskCalendarSettings } from "../settings";
import type { GroupingState, ProjectNote } from "./contracts";

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

/** Google's login: the refresh token kept in the settings. Implemented by GoogleAuth. */
export interface GoogleLogin {
	isLoggedIn(): boolean;
	login(): Promise<string>;
	logout(): Promise<void>;
}

/** The notes with the project tag (`projectNotesOf` reads them from the notes' tags): the Obsidian vault's; none on a host without notes. */
export interface Projects {
	list(): readonly ProjectNote[];
	/** Fires when a project note comes, goes, is renamed or loses its tag. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/**
 * The vault's notes as files, for «New project…»: the plugin's vault; none on a host that writes the note itself (the
 * phone's door gives the path and the text, the app writes them).
 */
export interface NoteFiles {
	/** Every file's path in the vault. */
	paths(): readonly string[];
	read(path: string): Promise<string>;
	/** `text` into the note at `path`, made when it is not there. */
	write(path: string, text: string): Promise<void>;
}

export const NO_NOTE_FILES: NoteFiles = {
	paths: () => [],
	read: async () => "",
	write: async () => {
		throw new Error("Task Calendar: no vault to write a project note to");
	},
};

/** What this device keeps of the lists grouped by project, never synced (the plugin: Obsidian's local storage). */
export interface GroupingStore {
	get(): GroupingState;
	set(state: GroupingState): void;
}

export const NO_PROJECTS: Projects = { list: () => [], onChange: () => () => undefined };

/** A device's grouping kept in memory: for a host that keeps none, and for tests. */
export function memoryGrouping(start: GroupingState = {}): GroupingStore {
	let state = start;
	return { get: () => state, set: (next) => (state = next) };
}

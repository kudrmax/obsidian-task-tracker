import type { CalendarFile } from "./calendarFile";
import type { CalendarSource } from "./contracts";

/** One calendar's file in the vault: what the calendar shows of the source. */
export interface EventFile {
	readonly name: CalendarSource;
	/** Throws when the file is missing or unreadable; the message becomes the source's status. */
	read(): Promise<CalendarFile>;
	/** The file was written: by Scriptable, by a feed, or by Sync from another device. */
	onChange(listener: () => void): () => void;
}

/** What brings a source's events into its file from elsewhere: Google's Calendar API. */
export interface EventFeed {
	readonly name: CalendarSource;
	/**
	 * Writes the file afresh. Unless `force`d, a feed that ran successfully less than the refresh interval ago under the
	 * same settings does nothing. Throws when it cannot; the file then keeps what it had.
	 */
	refresh(force: boolean): Promise<void>;
}

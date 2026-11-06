import type { CalendarFile } from "./calendarFile";
import type { CalendarSource, SourceProblem } from "./contracts";

/** A feed or a file that knows why it has nothing fresh; any other error it throws is `failed`, its message the detail. */
export class SourceProblemError extends Error {
	constructor(
		readonly problem: Exclude<SourceProblem, { readonly kind: "failed" }>,
		message: string,
	) {
		super(message);
		this.name = "SourceProblemError";
	}
}

/** One calendar's file in the vault: what the calendar shows of the source. */
export interface EventFile {
	readonly name: CalendarSource;
	/** Throws when the file is missing (`SourceProblemError`) or unreadable: the source's status says why. */
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

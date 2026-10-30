import type { CalendarEvent, CalendarSource } from "./contracts";

export interface EventBatch {
	readonly events: readonly CalendarEvent[];
	readonly updatedAt: Date;
	/** The work file's `device`; nothing for Google. */
	readonly detail?: string;
}

/** One calendar behind the CalendarService. Throws when it cannot fetch; the message becomes the source status. */
export interface EventSource {
	readonly name: CalendarSource;
	eventsBetween(start: Date, end: Date): Promise<EventBatch>;
	/** A source that knows when its data changed (the work file) says so; Google has no such signal and is polled. */
	onChange?(listener: () => void): () => void;
}

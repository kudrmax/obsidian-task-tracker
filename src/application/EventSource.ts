import type { CalendarEvent, CalendarSource } from "./contracts";

export interface EventBatch {
	readonly events: readonly CalendarEvent[];
	readonly updatedAt: Date;
}

/** One calendar behind the CalendarService. Throws when it cannot fetch; the message becomes the source status. */
export interface EventSource {
	readonly name: CalendarSource;
	eventsBetween(start: Date, end: Date): Promise<EventBatch>;
}

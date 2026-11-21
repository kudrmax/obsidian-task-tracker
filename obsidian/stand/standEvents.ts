import { addDays, CALENDAR_COLORS, DAY_START_HOUR, dayOf, type MockFile } from "./mockData";

/** A made-up event as a calendar's file lists it (the core's `CalendarEvent`, by its shape). */
export interface StandEvent {
	readonly id: string;
	readonly title: string;
	readonly start: Date;
	readonly end: Date;
	readonly allDay: boolean;
	readonly calendar: string;
	readonly color: string | null;
	readonly source: "google" | "work";
	readonly account: string | null;
	readonly calendarId: string | null;
}

const DAYS_AROUND = 7;

/** The stand's events, each day a week either way of today, as the calendars' files would list them (the work calendar's from the work file, as `MockPort` paints it): what `CorePort` reads on the stand. */
export function standEvents(file: MockFile, clock: Date): StandEvent[] {
	const today = dayOf(clock);
	const at = (day: Date, minute: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START_HOUR, minute);
	const events: StandEvent[] = [];
	for (let n = -DAYS_AROUND; n <= DAYS_AROUND; n++) {
		const day = addDays(today, n);
		const tag = `${n}`;
		for (const e of file.events) events.push({ id: `${e.id}@${tag}`, title: e.title, start: at(day, e.start), end: at(day, e.end), allDay: false, calendar: e.color, color: e.color, source: sourceOf(e.color), account: null, calendarId: null });
		for (const e of file.allDay) events.push({ id: `${e.id}@${tag}`, title: e.title, start: day, end: addDays(day, 1), allDay: true, calendar: e.color, color: e.color, source: sourceOf(e.color), account: null, calendarId: null });
	}
	return events;
}

const sourceOf = (color: string): StandEvent["source"] => (color === CALENDAR_COLORS.work ? "work" : "google");

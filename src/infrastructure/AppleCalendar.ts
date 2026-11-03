import type { CalendarEvent } from "../application/contracts";

export interface AppleCalendarHost {
	readonly isPhone: boolean;
	/** Hands a URL to the system: the phone opens the app it belongs to. */
	open(url: string): void;
	/** Runs an AppleScript on the Mac with these arguments. */
	runScript(script: string, args: readonly string[]): void;
}

/** Seconds from 1970 to 2001-01-01 UTC, where Apple's reference date starts. */
const APPLE_EPOCH_S = 978307200;
const MS_PER_S = 1000;
const S_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** The phone's Calendar opens at a moment given as seconds since Apple's reference date. */
export function calshowUrl(at: Date): string {
	return `calshow:${Math.floor(at.getTime() / MS_PER_S) - APPLE_EPOCH_S}`;
}

/**
 * The Mac's Calendar comes up on the event's day, at its time; then the event itself is looked for in its own calendar,
 * by title and start, and shown. A repeating event or one in a calendar the Mac doesn't have leaves the day as it is.
 */
export const SHOW_EVENT_SCRIPT = `on run argv
	set {theTitle, theCalendar, y, m, d, secs} to argv
	set theStart to current date
	set day of theStart to 1
	set year of theStart to (y as integer)
	set month of theStart to (m as integer)
	set day of theStart to (d as integer)
	set time of theStart to (secs as integer)
	tell application "Calendar"
		activate
		switch view to day view
		view calendar at theStart
		try
			set found to (every event of calendar theCalendar whose start date is theStart and summary is theTitle)
			if found is not {} then show item 1 of found
		end try
	end tell
end run`;

/** The script's arguments: the title, the calendar's name, and the start in the Mac's own time as year, month, day and seconds of the day. */
export function showEventArgs(event: CalendarEvent): string[] {
	const start = event.start;
	const seconds = (start.getHours() * MINUTES_PER_HOUR + start.getMinutes()) * S_PER_MINUTE + start.getSeconds();
	return [event.title, event.calendar, String(start.getFullYear()), String(start.getMonth() + 1), String(start.getDate()), String(seconds)];
}

/** Apple's Calendar at an event: on the phone at its start, on the Mac on its day with the event shown when Calendar has it. */
export class AppleCalendar {
	constructor(private readonly host: AppleCalendarHost) {}

	open(event: CalendarEvent): void {
		if (this.host.isPhone) this.host.open(calshowUrl(event.start));
		else this.host.runScript(SHOW_EVENT_SCRIPT, showEventArgs(event));
	}
}

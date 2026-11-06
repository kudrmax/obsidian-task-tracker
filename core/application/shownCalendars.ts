import { DayBoundary } from "../domain/DayBoundary";
import type { TaskCalendarSettings } from "../settings";
import { CalendarDays } from "./calendarDays";
import { CalendarChoice, type CalendarKey, type KnownCalendar } from "./calendarChoice";
import type { CalendarFile } from "./calendarFile";
import { hiddenNow } from "./calendarMigration";
import type { CalendarSource } from "./contracts";

const MINUTE_MS = 60_000;

/** The calendars of these files as the settings show them at `now`: the calendar on screen and the phone's meetings alike. */
export class ShownCalendars {
	constructor(
		private readonly files: ReadonlyMap<CalendarSource, CalendarFile>,
		private readonly settings: TaskCalendarSettings,
		private readonly now: Date,
	) {}

	/** Every calendar the files hold, hidden or not. */
	known(): readonly KnownCalendar[] {
		return this.choice([]).known();
	}

	/** The calendars the settings hide, the old choice carried over until it is. */
	hidden(): CalendarKey[] {
		return hiddenNow(this.settings, this.known(), this.files.get("google"));
	}

	/** The calendar's days, cut at the day's start, of the calendars shown. */
	days(): CalendarDays {
		return new CalendarDays(this.choice(this.hidden()), new DayBoundary(this.settings.dayStartHour));
	}

	private choice(hidden: readonly CalendarKey[]): CalendarChoice {
		return new CalendarChoice(this.files, hidden, this.settings.staleAfterMinutes * MINUTE_MS, this.now);
	}
}

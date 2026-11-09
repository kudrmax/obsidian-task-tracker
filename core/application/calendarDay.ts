import { sourceWords } from "./sourceWords";
import { dayRelation, type DayRelation } from "../domain/Days";
import { localDateOf } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import type { TaskCalendarSettings } from "../settings";
import { type CalendarKey, keyText } from "./calendarChoice";
import type { CalendarFile } from "./calendarFile";
import type { CalendarAlert, CalendarEvent, CalendarSource, DayEvents, ShownCalendar, SourceKind, SourceProblem, SourceStatus, SourceTone } from "./contracts";
import { ShownCalendars } from "./shownCalendars";
import { googleLoggedIn } from "./googleLogin";

/** Google is fetched by the plugin; the work calendar is a file the iPhone exports. */
const KINDS: Readonly<Record<CalendarSource, SourceKind>> = { google: "synced", iphone: "exported", work: "exported" };

const MINUTE_MS = 60_000;

const LOGGED_OUT: SourceProblem = { kind: "loggedOut" };

/** The sources window's order within the rows in use and within the spare ones. */
const WINDOW_ORDER: readonly CalendarSource[] = ["google", "iphone", "work"];

/** Each tone the dot shows, worst last. */
const ALERTS: readonly CalendarAlert[] = ["none", "old", "broken"];

function alertOf(tone: SourceTone): CalendarAlert {
	return tone === "old" || tone === "broken" ? tone : "none";
}

/** The calendars' files as last read, and why a source has nothing fresh: what a day's events are read from. */
export interface CalendarReading {
	/** The sources in the order the calendar reads them. */
	readonly sources: readonly CalendarSource[];
	readonly files: ReadonlyMap<CalendarSource, CalendarFile>;
	/** A source's file missing or unreadable, or its feed failed. */
	problem(source: CalendarSource): SourceProblem | null;
	/** The plugin fetches the source itself: its file's device says nothing. */
	fed(source: CalendarSource): boolean;
}

/**
 * The calendars' rules over files already read, synchronous: a day's events and the sources' statuses, the calendars
 * known, which are hidden. CalendarServiceImpl reads and fetches the files, the phone's door is handed their texts.
 */
export class CalendarDay {
	constructor(
		private readonly reading: CalendarReading,
		private readonly settings: TaskCalendarSettings,
		private readonly now: Date,
	) {}

	/** The day's events as the screen shows them; staleness counts from now. */
	events(date: LocalDate): DayEvents {
		const chosen = this.shown().days().day(date);
		const events = chosen.events;
		const shown = (name: CalendarSource) => events.filter((e) => e.source === name).length;
		const statuses = [...this.reading.sources]
			.sort((a, b) => WINDOW_ORDER.indexOf(a) - WINDOW_ORDER.indexOf(b))
			.map((source) => this.status(source, shown(source), chosen.used.has(source)));
		const inUse = statuses.filter((s) => s.used);
		const alert = inUse.map((s) => alertOf(s.tone)).reduce((worst, a) => (ALERTS.indexOf(a) > ALERTS.indexOf(worst) ? a : worst), "none" as CalendarAlert);
		return {
			events,
			allDay: events.filter((e) => e.allDay),
			timed: events.filter((e) => !e.allDay),
			statuses: [...inUse, ...statuses.filter((s) => !s.used)],
			stale: chosen.stale,
			alert,
		};
	}

	/** The timed events of the calendars shown that overlap `from`–`to`: the phone's meetings. */
	timedBetween(from: Date, to: Date): CalendarEvent[] {
		return this.shown().days().timedBetween(from, to);
	}

	/** The event is over by the clock: it is drawn grey. */
	isPast(event: Pick<CalendarEvent, "end">): boolean {
		return event.end.getTime() <= this.now.getTime();
	}

	/** Every calendar the files list, Google's first, each once; whether each is shown. */
	known(): readonly ShownCalendar[] {
		const hidden = new Set(this.hidden().map(keyText));
		return this.shown()
			.known()
			.map((c) => ({ account: c.key.account, title: c.key.title, accountName: c.accountName, name: c.name, color: c.color, shown: !hidden.has(keyText(c.key)) }));
	}

	/** The settings that show or hide one calendar. */
	shownChange(account: string, title: string, shown: boolean): Pick<TaskCalendarSettings, "hiddenCalendars" | "calendarsMigrated"> {
		const others = this.hidden().filter((k) => k.account !== account || k.title !== title);
		return { hiddenCalendars: shown ? others : [...others, { account, title }], calendarsMigrated: true };
	}

	/** On the phone, once both Google's and the phone's files are there: the old choice becomes the list of hidden calendars; null when not now. */
	carryOver(canMigrate: boolean): Pick<TaskCalendarSettings, "hiddenCalendars" | "calendarsMigrated"> | null {
		const google = this.reading.files.get("google");
		const withIds = google !== undefined && google.calendars.some((c) => c.calendarId !== null);
		if (this.settings.calendarsMigrated || !canMigrate || !withIds || !this.reading.files.has("iphone")) return null;
		return { hiddenCalendars: this.hidden(), calendarsMigrated: true };
	}

	hidden(): CalendarKey[] {
		return this.shown().hidden();
	}

	private shown(): ShownCalendars {
		return new ShownCalendars(this.reading.files, this.settings, this.now);
	}

	private status(source: CalendarSource, shown: number, used: boolean): SourceStatus {
		const problem = this.problem(source);
		const file = this.reading.files.get(source);
		const updatedAt = file?.exportedAt ?? null;
		const facts = {
			source,
			kind: KINDS[source],
			problem,
			updatedAt,
			updatedDay: updatedAt === null ? null : this.relationOf(updatedAt),
			updatedDate: updatedAt === null ? null : localDateOf(updatedAt),
			detail: this.reading.fed(source) ? null : (file?.device ?? null),
		};
		const old = this.isOld(updatedAt);
		return { ...facts, events: shown, stale: problem !== null || old, used, tone: toneOf(used, old, problem !== null), words: sourceWords(facts) };
	}

	/** Google logged out says so, whatever its file: there is none to fetch, or what is left of an old login. */
	private problem(source: CalendarSource): SourceProblem | null {
		if (source === "google" && !googleLoggedIn(this.settings)) return LOGGED_OUT;
		return this.reading.problem(source);
	}

	/** How the calendar date of `at` stands to the clock's: a moment's today and yesterday are calendar days, not the plugin's day. */
	private relationOf(at: Date): DayRelation {
		return dayRelation(localDateOf(at), localDateOf(this.now));
	}

	private isOld(updatedAt: Date | null): boolean {
		if (updatedAt === null) return true;
		return this.now.getTime() - updatedAt.getTime() > this.settings.staleAfterMinutes * MINUTE_MS;
	}
}

/** A row's code: only a source in use is coloured, and a failed try only matters once its file is old. */
function toneOf(used: boolean, old: boolean, problem: boolean): SourceTone {
	if (!used) return "spare";
	if (!old) return "plain";
	return problem ? "broken" : "old";
}

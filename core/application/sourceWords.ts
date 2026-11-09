import type { DayRelation } from "../domain/Days";
import { minutesToHHMM } from "../domain/LocalDate";
import type { LocalDate } from "../domain/Task";
import { dayMonth } from "./dayLabels";
import type { CalendarAlert, CalendarSource, SourceKind, SourceProblem, SourceTone } from "./contracts";

/** A calendar source's row in the sources window, worded: its names, the line under them, the time on the right. */
export interface SourceWords {
	readonly name: "Google Calendar" | "iPhone calendars" | "Work calendar";
	readonly short: "Google" | "iPhone" | "Work";
	/** `Updated today`, `Exported from iPhone`, `Not updated yet`, or why it has nothing fresh: `not logged in`, `file missing`, … */
	readonly sub: string;
	/** `14:19`, `Yesterday 08:02`, `3 Oct 08:02`; empty with no update. */
	readonly time: string;
	/** What the row's orange or red mark says (to a screen reader, on hover): `Out of date`, `Refresh failed`; empty with no mark. */
	readonly alert: string;
}

/** The sources window's own words and the dot's, for the day. */
export interface DayWords {
	/** What the dot on the calendar button (the badge on «⋯») says: `Out of date`, `Refresh failed`; empty with no dot. */
	readonly alert: string;
	/** The heading over the rows not in use. */
	readonly notInUse: "Not in use";
	/** The line under them, where the window has room for one (the app's section footer). */
	readonly notInUseNote: string;
}

/** A mark's words: `old` out of date, `broken` a refresh that failed; nothing else is marked. */
function alertText(tone: SourceTone | CalendarAlert): string {
	if (tone === "old") return "Out of date";
	if (tone === "broken") return "Refresh failed";
	return "";
}

/** The day's words: the dot's, by the worst tone in use, and the heading of the rows not in use. */
export function dayWords(alert: CalendarAlert): DayWords {
	return { alert: alertText(alert), notInUse: "Not in use", notInUseNote: "The timeline takes a calendar from these only when the files above go out of date." };
}

const NAMES = { google: { name: "Google Calendar", short: "Google" }, iphone: { name: "iPhone calendars", short: "iPhone" }, work: { name: "Work calendar", short: "Work" } } as const;

/** Why a source has nothing fresh, in the window's words. */
function problemText(problem: SourceProblem): string {
	switch (problem.kind) {
		case "loggedOut":
			return "not logged in";
		case "fileMissing":
			return "file missing";
		case "unreadable":
			return "file unreadable";
		case "noAnswer":
			return `no answer in ${problem.seconds} s`;
		case "failed":
			return shortFailure(problem.detail);
	}
}

/** The longest failure shown whole: one line of the sources window. */
const FAILURE_CHARS = 40;

/**
 * A failure's own text on one short line: its head, without the server's answer quoted after it (`Google API 500: {…}`);
 * still too long, its first line's start.
 */
function shortFailure(detail: string): string {
	const head = detail.replace(/:\s*[{[<][\s\S]*$/, "").trim();
	const line = head.split(/\r?\n/)[0].trim();
	return line.length <= FAILURE_CHARS ? line : `${line.slice(0, FAILURE_CHARS - 1)}…`;
}

/** What the words of a status are made of: the source, how it came, its problem, and when it was last brought up to date. */
export interface SourceFacts {
	readonly source: CalendarSource;
	readonly kind: SourceKind;
	readonly problem: SourceProblem | null;
	readonly updatedAt: Date | null;
	readonly updatedDay: DayRelation | null;
	readonly updatedDate: LocalDate | null;
	readonly detail: string | null;
	readonly tone: SourceTone;
}

/** When a source was last brought up to date, the way the board words it. */
export function sourceWords(status: SourceFacts): SourceWords {
	const names = NAMES[status.source];
	const at = status.updatedAt;
	const date = status.updatedDate === null ? "" : dayMonth(status.updatedDate);
	const relative = !at ? "" : status.updatedDay === "today" ? "today" : status.updatedDay === "yesterday" ? "yesterday" : date;
	const clock = at ? minutesToHHMM(at.getHours() * 60 + at.getMinutes()) : "";
	const time = !at ? "" : status.updatedDay === "today" ? clock : status.updatedDay === "yesterday" ? `Yesterday ${clock}` : `${date} ${clock}`;
	const sub = status.problem ? problemText(status.problem) : status.kind === "exported" ? `Exported from ${status.detail ?? "file"}` : at ? `Updated ${relative}` : "Not updated yet";
	return { name: names.name, short: names.short, sub, time, alert: alertText(status.tone) };
}

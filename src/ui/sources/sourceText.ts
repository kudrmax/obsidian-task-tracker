import type { SourceProblem, SourceStatus } from "../../application/contracts";
import { addDays, dayMonth, formatTime, localDateOf, minutesOf } from "../dates";

export interface SourceText {
	readonly name: "Google Calendar" | "iPhone calendars" | "Work calendar";
	readonly short: "Google" | "iPhone" | "Work";
	readonly sub: string;
	readonly time: string;
	readonly stale: boolean;
}

const NAMES = { google: { name: "Google Calendar", short: "Google" }, iphone: { name: "iPhone calendars", short: "iPhone" }, work: { name: "Work calendar", short: "Work" } } as const;

/** Why a source has nothing fresh, in the window's words. */
function problemText(problem: SourceProblem): string {
	switch (problem.kind) {
		case "loggedOut":
			return "not logged in";
		case "fileMissing":
			return "file missing";
		case "noAnswer":
			return `no answer in ${problem.seconds} s`;
		case "failed":
			return problem.detail;
	}
}

/** When a source was last brought up to date, the way the board words it. */
export function sourceText(status: SourceStatus, now: Date): SourceText {
	const names = NAMES[status.source];
	const at = status.updatedAt;
	const today = localDateOf(now);
	const day = at ? localDateOf(at) : null;
	const relative = day === today ? "today" : day === addDays(today, -1) ? "yesterday" : day ? dayMonth(day) : "";
	const clock = at ? formatTime(minutesOf(at)) : "";
	const time = !at ? "" : day === today ? clock : day === addDays(today, -1) ? `Yesterday ${clock}` : `${dayMonth(day!)} ${clock}`;
	const sub = status.problem ? problemText(status.problem) : status.kind === "exported" ? `Exported from ${status.detail ?? "file"}` : at ? `Updated ${relative}` : "Not updated yet";
	return { name: names.name, short: names.short, sub, time, stale: status.stale };
}

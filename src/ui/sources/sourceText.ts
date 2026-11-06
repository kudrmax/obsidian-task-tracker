import type { SourceProblem, SourceStatus } from "../../application/contracts";
import { dayMonth, formatTime, minutesOf } from "../dates";

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
export function sourceText(status: SourceStatus): SourceText {
	const names = NAMES[status.source];
	const at = status.updatedAt;
	const date = status.updatedDate === null ? "" : dayMonth(status.updatedDate);
	const relative = !at ? "" : status.updatedDay === "today" ? "today" : status.updatedDay === "yesterday" ? "yesterday" : date;
	const clock = at ? formatTime(minutesOf(at)) : "";
	const time = !at ? "" : status.updatedDay === "today" ? clock : status.updatedDay === "yesterday" ? `Yesterday ${clock}` : `${date} ${clock}`;
	const sub = status.problem ? problemText(status.problem) : status.kind === "exported" ? `Exported from ${status.detail ?? "file"}` : at ? `Updated ${relative}` : "Not updated yet";
	return { name: names.name, short: names.short, sub, time, stale: status.stale };
}

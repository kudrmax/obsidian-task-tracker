import type { SourceStatus } from "../../application/contracts";
import { addDays, dayMonth, formatTime, localDateOf, minutesOf } from "../dates";

export interface SourceText {
	readonly name: "Google Calendar" | "Work calendar";
	readonly short: "Google" | "Work";
	readonly sub: string;
	readonly time: string;
	readonly stale: boolean;
}

const NAMES = { google: { name: "Google Calendar", short: "Google" }, work: { name: "Work calendar", short: "Work" } } as const;

/** When a source was last brought up to date, the way the board words it. */
export function sourceText(status: SourceStatus, now: Date): SourceText {
	const names = NAMES[status.source];
	const at = status.updatedAt;
	const today = localDateOf(now);
	const day = at ? localDateOf(at) : null;
	const relative = day === today ? "today" : day === addDays(today, -1) ? "yesterday" : day ? dayMonth(day) : "";
	const clock = at ? formatTime(minutesOf(at)) : "";
	const time = !at ? "" : day === today ? clock : day === addDays(today, -1) ? `Yesterday ${clock}` : `${dayMonth(day!)} ${clock}`;
	const sub = !status.ok ? status.message : status.source === "work" ? `Exported from ${status.detail ?? "file"}` : at ? `Updated ${relative}` : "Not updated yet";
	return { name: names.name, short: names.short, sub, time, stale: status.stale };
}

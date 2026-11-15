import type { TaskCalendarSettings } from "../settings";
import type { EventsReason, SourceProblem } from "./contracts";
import { SourceProblemError } from "./EventSource";

const SECOND_MS = 1000;

/** A feed silent this long counts as failed: its file keeps what it had, and the next refresh asks afresh. */
export const FEED_SILENCE_MS = 15_000;

/**
 * What a day's events ask of the calendars for a reason. `feeds`: `forced` asks every feed afresh, `due` only a feed
 * whose last good run is older than the refresh interval (`feedDue`), `none` asks nothing and the events last read are
 * enough. `waitFeeds`: the fresh events wait for the feeds before the files are read (a refresh); otherwise the files are
 * read at once and a feed runs behind, its file's change drawing the day again. `exportFirst`: the phone is asked for
 * its fresh work events before anything is fetched (`WorkCalendarSetup.export`): Refresh now, by hand, alone.
 */
export interface CalendarsAsk {
	readonly feeds: "forced" | "due" | "none";
	readonly waitFeeds: boolean;
	readonly exportFirst: boolean;
}

/**
 * `cached`: the files were read before, so a day has events to show at once. `byHand`: Max asked (Refresh now), not
 * the polling or a source that changed.
 */
export function calendarsAsk(reason: EventsReason, cached: boolean, byHand = false): CalendarsAsk {
	if (reason === "refresh") return { feeds: "forced", waitFeeds: true, exportFirst: byHand };
	if (reason === "peek" && cached) return { feeds: "none", waitFeeds: false, exportFirst: false };
	return { feeds: "due", waitFeeds: false, exportFirst: false };
}

/** A feed's last good run: when, and under which settings (`feedKey`). */
export interface FeedRun {
	readonly atMs: number;
	readonly key: string;
}

/** The settings a feed's file depends on: a file written under others is not fresh. */
export function feedKey(settings: Pick<TaskCalendarSettings, "google">): string {
	const { clientId, refreshToken } = settings.google;
	return JSON.stringify([clientId, refreshToken]);
}

/** Whether a feed asked unforced runs: never ran well, ran under other settings, or longer ago than the refresh interval. */
export function feedDue(last: FeedRun | null, nowMs: number, settings: Pick<TaskCalendarSettings, "google">): boolean {
	const seconds = settings.google.refreshSeconds;
	if (seconds <= 0 || last === null || last.key !== feedKey(settings)) return true;
	return nowMs - last.atMs >= seconds * SECOND_MS;
}

/** A feed's failure as its source shows it: its own problem, any other error `failed` with its message. */
export function feedProblem(e: unknown): SourceProblem {
	if (e instanceof SourceProblemError) return e.problem;
	return { kind: "failed", detail: e instanceof Error ? e.message : String(e) };
}

/** A feed silent for `FEED_SILENCE_MS`. */
export function feedSilence(): SourceProblemError {
	return new SourceProblemError({ kind: "noAnswer", seconds: FEED_SILENCE_MS / SECOND_MS }, `no answer in ${FEED_SILENCE_MS / SECOND_MS} s`);
}

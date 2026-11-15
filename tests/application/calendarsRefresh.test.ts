import { describe, expect, it } from "vitest";
import { calendarsAsk, FEED_SILENCE_MS, feedDue, feedKey, feedProblem } from "../../core/application/calendarsRefresh";
import { SourceProblemError } from "../../core/application/EventSource";
import { callDoor, type DoorAnswer } from "../../core/application/PhoneCalls";
import { DEFAULT_SETTINGS } from "../../core/settings";

/**
 * The calendars' refresh rule as a pure decision: what a day's events ask of the feeds for a reason, when a feed is due,
 * and what a feed's failure or silence shows. The plugin's CalendarServiceImpl runs by it, and a host's network lane asks
 * it through the door (`calendarsRefresh.*`).
 */

const google = (refreshSeconds: number, refreshToken = "token") => ({ google: { ...DEFAULT_SETTINGS.google, refreshSeconds, refreshToken } });
const ok = (answer: DoorAnswer) => (answer as Extract<DoorAnswer, { ok: true }>).result;

describe("calendarsAsk", () => {
	it("refresh: every feed afresh, the files read once they answered", () => {
		expect(calendarsAsk("refresh", true)).toEqual({ feeds: "forced", waitFeeds: true });
		expect(calendarsAsk("refresh", false)).toEqual({ feeds: "forced", waitFeeds: true });
	});

	it("open: the files at once, a feed due runs behind", () => {
		expect(calendarsAsk("open", true)).toEqual({ feeds: "due", waitFeeds: false });
	});

	it("peek: nothing while there are events read before; as open when there are none", () => {
		expect(calendarsAsk("peek", true)).toEqual({ feeds: "none", waitFeeds: false });
		expect(calendarsAsk("peek", false)).toEqual({ feeds: "due", waitFeeds: false });
	});
});

describe("feedDue", () => {
	const settings = google(60);
	const last = { atMs: 1_000_000, key: feedKey(settings) };

	it("is due before its first good run, and past the refresh interval", () => {
		expect(feedDue(null, 1_000_000, settings)).toBe(true);
		expect(feedDue(last, 1_000_000 + 59_999, settings)).toBe(false);
		expect(feedDue(last, 1_000_000 + 60_000, settings)).toBe(true);
	});

	it("is due once the login changed, and always with no interval", () => {
		expect(feedDue(last, 1_000_001, google(60, "another"))).toBe(true);
		expect(feedDue({ ...last, key: feedKey(google(0)) }, 1_000_001, google(0))).toBe(true);
	});
});

describe("feedProblem", () => {
	it("is the feed's own problem, or failed with its message", () => {
		expect(feedProblem(new SourceProblemError({ kind: "loggedOut" }, "not logged in"))).toEqual({ kind: "loggedOut" });
		expect(feedProblem(new Error("500"))).toEqual({ kind: "failed", detail: "500" });
	});
});

describe("the door's calendarsRefresh", () => {
	const context = { tasks: null, nowMs: 1_000_000 + 30_000, settings: JSON.stringify(google(60)) };

	it("answers the ask, a feed's due over the settings and moment handed in, and its key", () => {
		expect(ok(callDoor("calendarsRefresh.ask", ["peek", true], context))).toEqual({ feeds: "none", waitFeeds: false });
		const key = ok(callDoor("calendarsRefresh.feedKey", [], context));
		expect(key).toBe(feedKey(google(60)));
		expect(ok(callDoor("calendarsRefresh.feedDue", [{ atMs: 1_000_000, key }], context))).toBe(false);
		expect(ok(callDoor("calendarsRefresh.feedDue", [null], context))).toBe(true);
	});

	it("answers a failure as its source shows it, and the silence after which a feed counts as failed", () => {
		expect(ok(callDoor("calendarsRefresh.problem", [{ problem: { kind: "loggedOut" } }], context))).toEqual({ kind: "loggedOut" });
		expect(ok(callDoor("calendarsRefresh.problem", [{ message: "500" }], context))).toEqual({ kind: "failed", detail: "500" });
		expect(ok(callDoor("calendarsRefresh.problem", [new Error("in-process")], context))).toEqual({ kind: "failed", detail: "in-process" });
		expect(ok(callDoor("calendarsRefresh.problem", ["thrown as text"], context))).toEqual(feedProblem("thrown as text"));
		expect(ok(callDoor("calendarsRefresh.problem", ["thrown as text"], context))).toEqual({ kind: "failed", detail: "thrown as text" });
		expect(ok(callDoor("calendarsRefresh.silence", [], context))).toEqual({ ms: FEED_SILENCE_MS, problem: { kind: "noAnswer", seconds: 15 } });
	});
});

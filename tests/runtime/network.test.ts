import { describe, expect, it } from "vitest";
import { GOOGLE_CALENDAR_FILE } from "../../core/application/calendarFile";
import { SourceProblemError } from "../../core/application/EventSource";
import type { CalendarFeed } from "../../obsidian/runtime/network/CalendarLane";
import { harness } from "./harness";

/** A feed whose runs end when the test says. */
class HeldFeed implements CalendarFeed {
	readonly name = "google" as const;
	readonly runs: { resolve: () => void; reject: (e: unknown) => void }[] = [];
	refresh(): Promise<void> {
		return new Promise((resolve, reject) => this.runs.push({ resolve, reject }));
	}
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the network lane", () => {
	it("lets the newest read win: an older read landing late is abandoned, never applied over newer texts", async () => {
		const held: { path: string; resolve: (text: string | null) => void }[] = [];
		const { runtime } = await harness({ readCalendar: (path) => new Promise((resolve) => held.push({ path, resolve })) });
		const older = runtime.refreshCalendars("peek");
		const olderReads = held.splice(0);
		const newer = runtime.refreshCalendars("peek");
		held.splice(0).forEach((r) => r.resolve(r.path === GOOGLE_CALENDAR_FILE ? "newer" : null));
		await newer;
		olderReads.forEach((r) => r.resolve(r.path === GOOGLE_CALENDAR_FILE ? "older" : null));
		await older;
		expect(runtime.replica.state.calendars.google).toBe("newer");
	});

	it("a refresh overtaken by a peek still reads the file its feed wrote: newer data is never dropped", async () => {
		const feed = new HeldFeed();
		const texts = new Map([[GOOGLE_CALENDAR_FILE, "old"]]);
		const { runtime } = await harness({ feeds: [feed], calendarTexts: texts });
		const opened = runtime.refreshCalendars("open");
		await tick();
		feed.runs[0].resolve();
		await opened;
		const refresh = runtime.refreshCalendars("refresh");
		await tick();
		await runtime.refreshCalendars("peek");
		expect(runtime.replica.state.calendars.google).toBe("old");
		texts.set(GOOGLE_CALENDAR_FILE, "fresh from Google");
		feed.runs[1].resolve();
		await refresh;
		expect(runtime.replica.state.calendars.google).toBe("fresh from Google");
	});

	it("asks the core's refresh rule: a peek with events read fetches nothing, an open fetches only a feed that is due", async () => {
		const feed = new HeldFeed();
		const texts = new Map([[GOOGLE_CALENDAR_FILE, "cached"]]);
		const { runtime } = await harness({ feeds: [feed], calendarTexts: texts });
		const opened = runtime.refreshCalendars("open");
		await tick();
		expect(feed.runs).toHaveLength(1);
		feed.runs[0].resolve();
		await opened;
		await runtime.refreshCalendars("peek");
		await runtime.refreshCalendars("open");
		expect(feed.runs).toHaveLength(1);
		expect(runtime.replica.state.calendars.google).toBe("cached");
	});

	it("asks the phone's export first only on Max's Refresh now: never on polling, an open or a source changing", async () => {
		const texts = new Map([["calendar/iphone.json", "x"]]);
		const { runtime, exports, calendarChanged } = await harness({ calendarTexts: texts });
		await runtime.refreshCalendars("open");
		await runtime.refreshCalendars("refresh");
		calendarChanged("calendar/iphone.json");
		await tick();
		expect(exports()).toBe(0);
		await runtime.refreshCalendars("refresh", true);
		expect(exports()).toBe(1);
	});

	it("reads a calendar file again when it changes in the vault (an export, another device)", async () => {
		const texts = new Map([["calendar/iphone.json", "before"]]);
		const { runtime, calendarChanged } = await harness({ calendarTexts: texts });
		await runtime.refreshCalendars("open");
		expect(runtime.replica.state.calendars.iphone).toBe("before");
		texts.set("calendar/iphone.json", "after");
		calendarChanged("Notes/unrelated.md");
		await tick();
		expect(runtime.replica.state.calendars.iphone).toBe("before");
		calendarChanged("calendar/iphone.json");
		await tick();
		expect(runtime.replica.state.calendars.iphone).toBe("after");
	});

	it("turns a file that cannot be read into its source's problem, not a rejection", async () => {
		const { runtime } = await harness({
			readCalendar: async (path) => {
				if (path === "calendar/iphone.json") throw new Error("EACCES");
				return null;
			},
		});
		await expect(runtime.refreshCalendars("open")).resolves.toBeUndefined();
		expect(runtime.replica.state.feedProblems).toEqual({ iphone: { kind: "failed", detail: "EACCES" } });
	});

	it("tells a feed's failure and its silence as the source's problem, and leaves the problems as they are when nothing changed", async () => {
		const feed = new HeldFeed();
		const { runtime, timers } = await harness({ feeds: [feed] });
		const failing = runtime.refreshCalendars("refresh");
		feed.runs[0].reject(new SourceProblemError({ kind: "loggedOut" }, "not logged in"));
		await failing;
		expect(runtime.replica.state.feedProblems).toEqual({ google: { kind: "loggedOut" } });
		const problems = runtime.replica.state.feedProblems;
		const again = runtime.refreshCalendars("refresh");
		feed.runs[1].reject(new SourceProblemError({ kind: "loggedOut" }, "not logged in"));
		await again;
		expect(runtime.replica.state.feedProblems).toBe(problems);
		const silent = runtime.refreshCalendars("refresh");
		await tick();
		const silence = [...timers.pending.entries()].find(([, t]) => t.ms === 15_000)!;
		timers.pending.delete(silence[0]);
		silence[1].fn();
		await silent;
		expect(runtime.replica.state.feedProblems).toEqual({ google: { kind: "noAnswer", seconds: 15 } });
		const good = runtime.refreshCalendars("refresh");
		feed.runs[3].resolve();
		await good;
		expect(runtime.replica.state.feedProblems).toEqual({});
	});
});

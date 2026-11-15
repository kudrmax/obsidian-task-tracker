import { describe, expect, it } from "vitest";
import { GOOGLE_CALENDAR_FILE } from "../../core/application/calendarFile";
import { SourceProblemError } from "../../core/application/EventSource";
import type { CalendarFeed } from "../../obsidian/runtime/network/CalendarLane";
import { DAY, harness } from "./harness";

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
	it("lets the latest ask of a day win: a superseded fetch is abandoned, what it brings never applied", async () => {
		const feed = new HeldFeed();
		const texts = new Map<string, string>();
		const { runtime } = await harness({ feeds: [feed], calendarTexts: texts });
		const first = runtime.refreshCalendars(DAY, "refresh");
		const second = runtime.refreshCalendars(DAY, "refresh");
		texts.set(GOOGLE_CALENDAR_FILE, "second");
		feed.runs[1].resolve();
		await second;
		expect(runtime.replica.state.calendars.google).toBe("second");
		texts.set(GOOGLE_CALENDAR_FILE, "first, late");
		feed.runs[0].resolve();
		await first;
		expect(runtime.replica.state.calendars.google).toBe("second");
	});

	it("asks the core's refresh rule: a peek with events read fetches nothing, an open fetches only a feed that is due", async () => {
		const feed = new HeldFeed();
		const texts = new Map([[GOOGLE_CALENDAR_FILE, "cached"]]);
		const { runtime } = await harness({ feeds: [feed], calendarTexts: texts });
		const opened = runtime.refreshCalendars(DAY, "open");
		await tick();
		expect(feed.runs).toHaveLength(1);
		feed.runs[0].resolve();
		await opened;
		await runtime.refreshCalendars(DAY, "peek");
		await runtime.refreshCalendars(DAY, "open");
		expect(feed.runs).toHaveLength(1);
		expect(runtime.replica.state.calendars.google).toBe("cached");
	});

	it("tells a feed's failure and its silence to the door as the source's problem", async () => {
		const feed = new HeldFeed();
		const { runtime, timers } = await harness({ feeds: [feed] });
		const failing = runtime.refreshCalendars(DAY, "refresh");
		feed.runs[0].reject(new SourceProblemError({ kind: "loggedOut" }, "not logged in"));
		await failing;
		expect(runtime.replica.state.feedProblems).toEqual({ google: { kind: "loggedOut" } });
		const silent = runtime.refreshCalendars(DAY, "refresh");
		await tick();
		expect(timers.delays).toContain(15_000);
		const silence = [...timers.pending.entries()].find(([, t]) => t.ms === 15_000)!;
		timers.pending.delete(silence[0]);
		silence[1].fn();
		await silent;
		expect(runtime.replica.state.feedProblems).toEqual({ google: { kind: "noAnswer", seconds: 15 } });
		const good = runtime.refreshCalendars(DAY, "refresh");
		feed.runs[2].resolve();
		await good;
		expect(runtime.replica.state.feedProblems).toEqual({});
	});
});

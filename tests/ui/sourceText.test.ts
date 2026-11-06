import { describe, expect, it } from "vitest";
import type { SourceStatus } from "../../src/application/contracts";
import { sourceText } from "../../src/ui/sources/sourceText";

const status = (extra: Partial<SourceStatus>): SourceStatus => ({ source: "google", kind: "synced", problem: null, events: 7, updatedAt: null, updatedDay: null, detail: null, stale: false, ...extra });

describe("sourceText", () => {
	it("says Google was updated today at its time", () => {
		const t = sourceText(status({ updatedAt: new Date(2026, 9, 30, 14, 19), updatedDay: "today" }));
		expect(t).toEqual({ name: "Google Calendar", short: "Google", sub: "Updated today", time: "14:19", stale: false });
	});

	it("says the work file was exported from the device, yesterday, and is stale", () => {
		const t = sourceText(status({ source: "work", kind: "exported", updatedAt: new Date(2026, 9, 29, 8, 2), updatedDay: "yesterday", detail: "iPhone", stale: true }));
		expect(t).toEqual({ name: "Work calendar", short: "Work", sub: "Exported from iPhone", time: "Yesterday 08:02", stale: true });
	});

	it("an export after midnight, before the day starts, is today's: its time alone", () => {
		const t = sourceText(status({ source: "work", kind: "exported", updatedAt: new Date(2026, 10, 6, 2, 21), updatedDay: "today", detail: "iPhone" }));
		expect([t.sub, t.time]).toEqual(["Exported from iPhone", "02:21"]);
	});

	it("names the iPhone's calendars and says which phone wrote them", () => {
		const t = sourceText(status({ source: "iphone", kind: "exported", updatedAt: new Date(2026, 9, 30, 8, 0), updatedDay: "today", detail: "iPhone Макса" }));
		expect([t.name, t.short, t.sub]).toEqual(["iPhone calendars", "iPhone", "Exported from iPhone Макса"]);
	});

	it("dates an older update, and shows an error's text with no time", () => {
		expect(sourceText(status({ updatedAt: new Date(2026, 9, 3, 8, 2), updatedDay: "other" })).time).toBe("3 Oct 08:02");
		expect(sourceText(status({ updatedAt: new Date(2026, 9, 3, 8, 2), updatedDay: "other" })).sub).toBe("Updated 3 Oct");
		const failed = sourceText(status({ problem: { kind: "loggedOut" }, stale: true }));
		expect(failed.sub).toBe("not logged in");
		expect(failed.time).toBe("");
		expect(failed.stale).toBe(true);
	});

	it("words each problem as the sources window always did", () => {
		const sub = (problem: SourceStatus["problem"]) => sourceText(status({ problem })).sub;
		expect(sub({ kind: "fileMissing" })).toBe("file missing");
		expect(sub({ kind: "noAnswer", seconds: 15 })).toBe("no answer in 15 s");
		expect(sub({ kind: "failed", detail: "Google API 500: oops" })).toBe("Google API 500: oops");
	});
});

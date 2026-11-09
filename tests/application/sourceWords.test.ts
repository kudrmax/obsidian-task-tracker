import { describe, expect, it } from "vitest";
import { dayWords, type SourceFacts, sourceWords } from "../../core/application/sourceWords";

const status = (extra: Partial<SourceFacts>): SourceFacts => ({ source: "google", kind: "synced", problem: null, updatedAt: null, updatedDay: null, updatedDate: null, detail: null, tone: "plain", ...extra });
const sourceText = sourceWords;

describe("sourceWords", () => {
	it("says Google was updated today at its time", () => {
		const t = sourceText(status({ updatedAt: new Date(2026, 9, 30, 14, 19), updatedDay: "today" }));
		expect(t).toEqual({ name: "Google Calendar", short: "Google", sub: "Updated today", time: "14:19", alert: "" });
	});

	it("says the work file was exported from the device, yesterday, and is stale", () => {
		const t = sourceText(status({ source: "work", kind: "exported", updatedAt: new Date(2026, 9, 29, 8, 2), updatedDay: "yesterday", detail: "iPhone" }));
		expect(t).toEqual({ name: "Work calendar", short: "Work", sub: "Exported from iPhone", time: "Yesterday 08:02", alert: "" });
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
		expect(sourceText(status({ updatedAt: new Date(2026, 9, 3, 8, 2), updatedDay: "other", updatedDate: "2026-10-03" })).time).toBe("3 Oct 08:02");
		expect(sourceText(status({ updatedAt: new Date(2026, 9, 3, 8, 2), updatedDay: "other", updatedDate: "2026-10-03" })).sub).toBe("Updated 3 Oct");
		const failed = sourceText(status({ problem: { kind: "loggedOut" } }));
		expect(failed.sub).toBe("not logged in");
		expect(failed.time).toBe("");
	});

	it("words each problem as the sources window always did", () => {
		const sub = (problem: SourceFacts["problem"]) => sourceText(status({ problem })).sub;
		expect(sub({ kind: "fileMissing" })).toBe("file missing");
		expect(sub({ kind: "noAnswer", seconds: 15 })).toBe("no answer in 15 s");
		expect(sub({ kind: "failed", detail: "Google API 500: oops" })).toBe("Google API 500: oops");
	});

	it("words a file that is no calendar file as unreadable", () => {
		expect(sourceText(status({ problem: { kind: "unreadable" } })).sub).toBe("file unreadable");
	});

	it("keeps a failure's words to one short line: without the answer quoted after it, else its start", () => {
		const sub = (detail: string) => sourceText(status({ problem: { kind: "failed", detail } })).sub;
		expect(sub(`Google API 500: ${JSON.stringify({ error: { code: 500, message: "Backend Error", status: "INTERNAL" } })}`)).toBe("Google API 500");
		expect(sub("Google token endpoint 400: {\n  \"error\": \"invalid_grant\"\n}")).toBe("Google token endpoint 400");
		expect(sub("net::ERR_INTERNET_DISCONNECTED")).toBe("net::ERR_INTERNET_DISCONNECTED");
		expect(sub("first line\nsecond line")).toBe("first line");
		expect(sub("a".repeat(60))).toBe(`${"a".repeat(39)}…`);
		expect(sub("x".repeat(60) + ": y")).toBe(`${"x".repeat(39)}…`);
		expect(sub("Google API 503: <html><body>Service Unavailable</body></html>")).toBe("Google API 503");
	});
});

describe("the marks' words", () => {
	it("say out of date for old, refresh failed for broken, nothing else", () => {
		const alert = (tone: SourceFacts["tone"]) => sourceText(status({ tone })).alert;
		expect([alert("plain"), alert("old"), alert("broken"), alert("spare")]).toEqual(["", "Out of date", "Refresh failed", ""]);
		expect([dayWords("none").alert, dayWords("old").alert, dayWords("broken").alert]).toEqual(["", "Out of date", "Refresh failed"]);
		expect(dayWords("none").notInUse).toBe("Not in use");
	});
});

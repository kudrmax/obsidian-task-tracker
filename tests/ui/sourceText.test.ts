import { describe, expect, it } from "vitest";
import type { SourceStatus } from "../../src/application/contracts";
import { sourceText } from "../../src/ui/sources/sourceText";

const now = new Date(2026, 9, 30, 14, 20);
const status = (extra: Partial<SourceStatus>): SourceStatus => ({ source: "google", ok: true, message: "7 events", updatedAt: null, detail: null, stale: false, ...extra });

describe("sourceText", () => {
	it("says Google was updated today at its time", () => {
		const t = sourceText(status({ updatedAt: new Date(2026, 9, 30, 14, 19) }), now);
		expect(t).toEqual({ name: "Google Calendar", short: "Google", sub: "Updated today", time: "14:19", stale: false });
	});

	it("says the work file was exported from the device, yesterday, and is stale", () => {
		const t = sourceText(status({ source: "work", updatedAt: new Date(2026, 9, 29, 8, 2), detail: "iPhone", stale: true }), now);
		expect(t).toEqual({ name: "Work calendar", short: "Work", sub: "Exported from iPhone", time: "Yesterday 08:02", stale: true });
	});

	it("dates an older update, and shows an error's text with no time", () => {
		expect(sourceText(status({ updatedAt: new Date(2026, 9, 3, 8, 2) }), now).time).toBe("3 Oct 08:02");
		expect(sourceText(status({ updatedAt: new Date(2026, 9, 3, 8, 2) }), now).sub).toBe("Updated 3 Oct");
		const failed = sourceText(status({ ok: false, message: "not logged in", stale: true }), now);
		expect(failed.sub).toBe("not logged in");
		expect(failed.time).toBe("");
		expect(failed.stale).toBe(true);
	});
});

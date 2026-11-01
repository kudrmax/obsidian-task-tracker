import { describe, expect, it } from "vitest";
import { samePlacement } from "../../src/application/placements";

describe("samePlacement", () => {
	it("is the same kind, and for a date the same day", () => {
		expect(samePlacement({ kind: "soon" }, { kind: "soon" })).toBe(true);
		expect(samePlacement({ kind: "now" }, { kind: "soon" })).toBe(false);
		expect(samePlacement({ kind: "date", date: "2026-11-05" }, { kind: "date", date: "2026-11-05" })).toBe(true);
		expect(samePlacement({ kind: "date", date: "2026-11-05" }, { kind: "date", date: "2026-11-06" })).toBe(false);
		expect(samePlacement({ kind: "date", date: "2026-11-05" }, { kind: "now" })).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { isoMoment } from "../../src/domain/IsoMoment";

describe("isoMoment", () => {
	it("reads what the calendars' writers write as Date does", () => {
		for (const text of ["2026-11-05T10:00:00.000Z", "2026-11-05T10:00:00Z", "2026-11-05T10:00Z", "2026-11-05T23:59:59.999Z", "2026-11-05", "2026-11-05T10:00:00", "2026-11-05T10:00", "2026-11-05T10:00:00+03:00", "2026-11-05T10:00:00.5-05:00", "2026-03-08T07:30:00.000Z"]) {
			expect({ text, ms: isoMoment(text).getTime() }).toEqual({ text, ms: new Date(text).getTime() });
		}
	});

	it("reads anything else as an invalid date", () => {
		for (const text of ["", "yesterday", "2026-11-05 10:00", "Thu Nov 05 2026", "2026-13-01", "2026-11-05T25:00"]) expect({ text, valid: !Number.isNaN(isoMoment(text).getTime()) }).toEqual({ text, valid: false });
	});
});

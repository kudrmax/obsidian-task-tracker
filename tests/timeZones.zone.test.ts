import { describe, expect, it } from "vitest";

/** The offset from UTC, in minutes as Date counts them, of mid-January in each zone the door's tests also run in. */
const JANUARY_OFFSETS: Readonly<Record<string, number>> = { "Asia/Novosibirsk": -420, "America/New_York": 300 };

describe("the time zone a project runs the door's tests in", () => {
	it("is the one it names: the core reads the device's local time, so these runs read another one", () => {
		const zone = process.env.TZ ?? "";
		expect(Object.keys(JANUARY_OFFSETS)).toContain(zone);
		expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(JANUARY_OFFSETS[zone]);
	});
});

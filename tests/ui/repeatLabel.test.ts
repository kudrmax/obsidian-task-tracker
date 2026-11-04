import { describe, expect, it } from "vitest";
import type { RepeatRule } from "../../src/application/contracts";
import { ordinal, repeatValue } from "../../src/ui/repeat/repeatLabel";

const rule = (over: Partial<RepeatRule>): RepeatRule => ({ kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null, ...over });

describe("repeatValue", () => {
	it("weeks on a schedule: none, the row draws the week's letters", () => {
		expect(repeatValue(rule({ unit: "week", days: [0, 2, 4] }))).toBeNull();
		expect(repeatValue(rule({ every: 3, unit: "week", days: [4], from: "2026-11-06" }))).toBeNull();
	});

	it("days on a schedule", () => {
		expect(repeatValue(rule({}))).toBe("Every day");
		expect(repeatValue(rule({ every: 3, from: "2026-11-04" }))).toBe("Every 3 days");
	});

	it("months on a schedule", () => {
		expect(repeatValue(rule({ unit: "month", dayOfMonth: 5 }))).toBe("On the 5th");
		expect(repeatValue(rule({ every: 2, unit: "month", dayOfMonth: 5, from: "2026-11-05" }))).toBe("Every 2 months on the 5th");
	});

	it("after done", () => {
		expect(repeatValue(rule({ kind: "afterDone", every: 3, unit: "week" }))).toBe("Every 3 weeks after done");
		expect(repeatValue(rule({ kind: "afterDone", unit: "day" }))).toBe("Every day after done");
		expect(repeatValue(rule({ kind: "afterDone", every: 2, unit: "month" }))).toBe("Every 2 months after done");
	});
});

describe("ordinal", () => {
	it("1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 31st", () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
	});
});

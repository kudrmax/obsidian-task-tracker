import { describe, expect, it } from "vitest";
import { Repeat } from "../../src/domain/Repeat";

const cases = [
	"every week on Mon, Wed, Fri",
	"every 3 weeks on Fri from 2026-11-06",
	"every month on the 5th",
	"every 2 months on the 31st from 2026-10-31",
	"every 3 days from 2026-11-04",
	"every day",
	"every 3 weeks when done",
	"every month when done",
];

describe("Repeat", () => {
	it.each(cases)("round-trips %s", (t) => expect(Repeat.parse(t)!.format()).toBe(t));
	it.each(["every", "every 0 days", "every week on Funday", "every month on the 32nd", "every 2 weeks on Fri", "weekly", "every week on Fri from 2026-11-06", "every 3 day from 2026-11-04", "every weeks on Mon", "every week on Wed, Mon", "every month on the 2th"])(
		"rejects %s",
		(t) => expect(Repeat.parse(t)).toBeNull(),
	);
	it("ordinals", () => expect(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"].every((o) => Repeat.parse(`every month on the ${o}`))).toBe(true));
	it("weekly picks the next chosen day", () => expect(Repeat.parse("every week on Mon, Wed, Fri")!.next("2026-11-05", "2026-11-05")).toBe("2026-11-06"));
	it("every 3 weeks keeps its anchor", () => expect(Repeat.parse("every 3 weeks on Fri from 2026-11-06")!.next("2026-11-06", "2026-11-06")).toBe("2026-11-27"));
	it("anchor far in the past", () => expect(Repeat.parse("every 3 days from 2020-01-01")!.next(null, "2026-11-05")).toBe("2026-11-07"));
	it("31st falls on the 30th", () => expect(Repeat.parse("every month on the 31st")!.next("2026-10-31", "2026-10-31")).toBe("2026-11-30"));
	it("february", () => expect(Repeat.parse("every month on the 30th")!.next("2027-01-30", "2027-01-30")).toBe("2027-02-28"));
	it("over the year", () => expect(Repeat.parse("every week on Mon")!.next("2026-12-28", "2026-12-28")).toBe("2027-01-04"));
	it("early done counts from the due date", () => expect(Repeat.parse("every week on Mon")!.next("2026-11-09", "2026-11-08")).toBe("2026-11-16"));
	it("after done counts from today", () => expect(Repeat.parse("every 3 weeks when done")!.next("2026-11-01", "2026-11-05")).toBe("2026-11-26"));
	it("after done months clamp", () => expect(Repeat.parse("every month when done")!.next(null, "2027-01-31")).toBe("2027-02-28"));
	it("first: schedule today or later", () => expect(Repeat.parse("every week on Thu")!.first("2026-11-05")).toBe("2026-11-05"));
	it("first: after done has none", () => expect(Repeat.parse("every week when done")!.first("2026-11-05")).toBeNull());
	it("every 2 months skips the off month", () => expect(Repeat.parse("every 2 months on the 31st from 2026-10-31")!.next("2026-10-31", "2026-10-31")).toBe("2026-12-31"));
	it("anchoredAt sets from only for N > 1", () => {
		expect(Repeat.parse("every 2 weeks on Fri from 2026-01-02")!.anchoredAt("2026-11-06").format()).toBe("every 2 weeks on Fri from 2026-11-06");
		expect(Repeat.parse("every week on Fri")!.anchoredAt("2026-11-06").format()).toBe("every week on Fri");
	});
});

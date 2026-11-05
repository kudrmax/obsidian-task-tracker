import { describe, expect, it } from "vitest";
import { MINUTES_PER_DAY } from "../../src/application/contracts";
import { DESIGN } from "../../src/ui/design";

describe("the day's length", () => {
	it("is the domain's: the hours the timeline draws make up its minutes", () => {
		expect(DESIGN.dayHours * 60).toBe(MINUTES_PER_DAY);
	});
});

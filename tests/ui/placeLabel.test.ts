import { describe, expect, it } from "vitest";
import { placeLabel } from "../../src/ui/placeLabel";

describe("placeLabel", () => {
	it("names Inbox, Soon and Now, and a day by its date", () => {
		expect(placeLabel({ kind: "inbox" })).toBe("Inbox");
		expect(placeLabel({ kind: "soon" })).toBe("Soon");
		expect(placeLabel({ kind: "now" })).toBe("Now");
		expect(placeLabel({ kind: "date", date: "2026-11-02" })).toBe("2 Nov");
	});
});

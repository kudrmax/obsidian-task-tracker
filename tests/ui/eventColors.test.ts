import { describe, expect, it } from "vitest";
import { eventColors } from "../../src/ui/eventColors";

describe("eventColors", () => {
	it("builds the block's ground, bar and text from the calendar's colour", () => {
		expect(eventColors("#0A84FF")).toEqual({ bg: "rgba(10, 132, 255, 0.22)", bar: "#0A84FF", text: "#85C2FF" });
	});

	it("takes a stronger ground when asked, as the board's work calendar does", () => {
		expect(eventColors("#0A84FF", 0.24).bg).toBe("rgba(10, 132, 255, 0.24)");
	});

	it("reads lower-case and short hex", () => {
		expect(eventColors("#ff9f0a").bar).toBe("#FF9F0A");
		expect(eventColors("#fff").bar).toBe("#FFFFFF");
	});
});

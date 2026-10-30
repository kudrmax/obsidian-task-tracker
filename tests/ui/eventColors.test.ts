import { describe, expect, it } from "vitest";
import { eventColors } from "../../src/ui/eventColors";

describe("eventColors", () => {
	it("builds the block's ground, bar and text from the calendar's colour", () => {
		expect(eventColors("#0A84FF")).toEqual({ bg: "rgba(10, 132, 255, 0.22)", bar: "#0A84FF", text: "#85C2FF" });
	});

	it("takes a stronger ground when asked, as the board's work calendar does", () => {
		expect(eventColors("#0A84FF", 0.24).bg).toBe("rgba(10, 132, 255, 0.24)");
	});

	it("on the light theme tints the ground lightly and darkens the text, more for a bright colour", () => {
		expect(eventColors("#007AFF", 0.24, "light")).toEqual({ bg: "rgba(0, 122, 255, 0.13)", bar: "#007AFF", text: "#0058B8" });
		expect(eventColors("#FF9500", 0.22, "light")).toEqual({ bg: "rgba(255, 149, 0, 0.16)", bar: "#FF9500", text: "#995900" });
		expect(eventColors("#34C759", 0.22, "light").text).toBe("#1F7735");
		expect(eventColors("#FF2D55", 0.22, "light").bg).toBe("rgba(255, 45, 85, 0.13)");
	});

	it("reads lower-case and short hex", () => {
		expect(eventColors("#ff9f0a").bar).toBe("#FF9F0A");
		expect(eventColors("#fff").bar).toBe("#FFFFFF");
	});
});

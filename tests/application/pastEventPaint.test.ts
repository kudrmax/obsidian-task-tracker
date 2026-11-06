import { describe, expect, it } from "vitest";
import { pastEventPaint } from "../../core/application/paints";

describe("pastEventPaint", () => {
	it("lifts the ground 1.5% towards the text and draws the bar and the title 12.5% towards it, on the dark theme", () => {
		expect(pastEventPaint("#000000", "#FFFFFF", "dark")).toEqual({ bg: "#040404", bar: "#202020", text: "#202020" });
	});

	it("takes 1.2% and 10% on the light theme", () => {
		expect(pastEventPaint("#FFFFFF", "#000000", "light")).toEqual({ bg: "#FCFCFC", bar: "#E6E6E6", text: "#E6E6E6" });
	});

	it("mixes each channel of any ground and text, and reads the short form", () => {
		expect(pastEventPaint("#202020", "#dadada", "dark")).toEqual({ bg: "#232323", bar: "#373737", text: "#373737" });
		expect(pastEventPaint("#fff", "#000", "light")).toEqual(pastEventPaint("#FFFFFF", "#000000", "light"));
	});
});

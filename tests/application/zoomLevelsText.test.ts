import { describe, expect, it } from "vitest";
import { DEFAULT_ZOOM_LEVELS, formatZoomLevels, parseZoomLevels } from "../../core/application/contracts";

describe("zoom levels text", () => {
	it("formats the defaults as the hour's heights", () => {
		expect(formatZoomLevels(DEFAULT_ZOOM_LEVELS)).toBe("28, 56, 112, 224");
	});

	it("parses what it formats", () => {
		expect(parseZoomLevels("28, 56, 112, 224")).toEqual(DEFAULT_ZOOM_LEVELS);
		expect(parseZoomLevels(" 40 ")).toEqual([{ hourPx: 40 }]);
	});

	it("still reads the old text with a step after each height, and drops the step", () => {
		expect(parseZoomLevels("28:60, 56:30")).toEqual([{ hourPx: 28 }, { hourPx: 56 }]);
	});

	it("rejects malformed or out-of-range text", () => {
		expect(parseZoomLevels("")).toBeNull();
		expect(parseZoomLevels("28, x")).toBeNull();
		expect(parseZoomLevels("0")).toBeNull();
		expect(parseZoomLevels("28:")).toBeNull();
	});
});

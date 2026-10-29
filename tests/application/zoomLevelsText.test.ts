import { describe, expect, it } from "vitest";
import { formatZoomLevels, parseZoomLevels } from "../../src/application/zoomLevelsText";
import { DEFAULT_SETTINGS } from "../../src/settings";

describe("zoom levels text", () => {
	it("formats the defaults", () => {
		expect(formatZoomLevels(DEFAULT_SETTINGS.zoomLevels)).toBe("28:60, 56:30, 112:15, 224:5");
	});

	it("parses what it formats", () => {
		expect(parseZoomLevels("28:60, 56:30, 112:15, 224:5")).toEqual(DEFAULT_SETTINGS.zoomLevels);
		expect(parseZoomLevels(" 40 : 30 ")).toEqual([{ hourPx: 40, stepMinutes: 30 }]);
	});

	it("rejects malformed or out-of-range text", () => {
		expect(parseZoomLevels("")).toBeNull();
		expect(parseZoomLevels("28")).toBeNull();
		expect(parseZoomLevels("28:60, x")).toBeNull();
		expect(parseZoomLevels("0:60")).toBeNull();
		expect(parseZoomLevels("28:90")).toBeNull();
	});
});

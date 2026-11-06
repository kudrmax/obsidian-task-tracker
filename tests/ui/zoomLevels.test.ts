import { describe, expect, it } from "vitest";
import { levelsFor } from "../../src/ui/zoomLevels";

const levels = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];

describe("levelsFor", () => {
	it("puts the whole day in the smallest level's place", () => {
		expect(levelsFor(27, levels)).toEqual([{ hourPx: 27 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }]);
	});

	it("drops the levels a tall screen would leave room under the day at", () => {
		expect(levelsFor(60, levels)).toEqual([{ hourPx: 60 }, { hourPx: 112 }, { hourPx: 224 }]);
		expect(levelsFor(300, levels)).toEqual([{ hourPx: 300 }]);
	});

	it("reads the levels in any order", () => {
		expect(levelsFor(27, [{ hourPx: 112 }, { hourPx: 28 }, { hourPx: 56 }])).toEqual([{ hourPx: 27 }, { hourPx: 56 }, { hourPx: 112 }]);
	});
});

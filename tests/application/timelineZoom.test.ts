import { describe, expect, it } from "vitest";
import { DEFAULT_ZOOM_HOUR, DEFAULT_ZOOM_LEVELS, formatZoomLevels, gridAt, gridMarks, levelsFor, parseZoomLevels, zoomLevelsOf } from "../../core/application/timelineZoom";

const MEASURES = { divisions: [5, 15, 30], labelGap: 40, tickMinutes: 5, tickGap: 16 };

describe("the default zoom", () => {
	it("opens at one of the default levels", () => {
		expect(DEFAULT_ZOOM_LEVELS.map((l) => l.hourPx)).toContain(DEFAULT_ZOOM_HOUR);
	});
});

describe("parseZoomLevels and formatZoomLevels", () => {
	it("read back what they write", () => {
		expect(parseZoomLevels(formatZoomLevels(DEFAULT_ZOOM_LEVELS))).toEqual(DEFAULT_ZOOM_LEVELS);
		expect(formatZoomLevels([{ hourPx: 40 }, { hourPx: 80 }])).toBe("40, 80");
	});

	it("read the old text with a step after each height, the step dropped", () => {
		expect(parseZoomLevels("28:60, 56 : 30")).toEqual([{ hourPx: 28 }, { hourPx: 56 }]);
	});

	it("read nothing of an empty, a zero or a stray height", () => {
		for (const text of ["", " ", "0", "28, x", "28,", "-5", "1.5"]) expect(parseZoomLevels(text)).toBeNull();
	});
});

describe("zoomLevelsOf", () => {
	it("is the levels data.json keeps", () => {
		expect(zoomLevelsOf({ zoomLevels: [{ hourPx: 40 }, { hourPx: 80 }] })).toEqual([{ hourPx: 40 }, { hourPx: 80 }]);
	});

	it("drops what a level carries besides its height", () => {
		expect(zoomLevelsOf({ zoomLevels: [{ hourPx: 40, minutes: 15 }] })).toEqual([{ hourPx: 40 }]);
	});

	it("is the defaults where data.json keeps none, or none that read", () => {
		const unread = [null, undefined, {}, "x", { zoomLevels: [] }, { zoomLevels: "28, 56" }, { zoomLevels: [{ hourPx: 0 }] }, { zoomLevels: [{ hourPx: 40 }, { hourPx: "80" }] }, { zoomLevels: [null] }, { zoomLevels: [{ hourPx: Number.NaN }] }];
		for (const saved of unread) expect(zoomLevelsOf(saved)).toEqual(DEFAULT_ZOOM_LEVELS);
	});
});

describe("levelsFor", () => {
	const levels = [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }];

	it("puts the whole day in the smallest level's place", () => {
		expect(levelsFor(27, levels)).toEqual([{ hourPx: 27 }, { hourPx: 56 }, { hourPx: 112 }, { hourPx: 224 }]);
	});

	it("drops the levels a tall screen would leave room under the day at", () => {
		expect(levelsFor(60, levels)).toEqual([{ hourPx: 60 }, { hourPx: 112 }, { hourPx: 224 }]);
		expect(levelsFor(300, levels)).toEqual([{ hourPx: 300 }]);
	});

	it("reads the levels in any order and leaves them as they were", () => {
		const shuffled = [{ hourPx: 112 }, { hourPx: 28 }, { hourPx: 56 }];
		expect(levelsFor(27, shuffled)).toEqual([{ hourPx: 27 }, { hourPx: 56 }, { hourPx: 112 }]);
		expect(shuffled).toEqual([{ hourPx: 112 }, { hourPx: 28 }, { hourPx: 56 }]);
	});
});

describe("gridAt", () => {
	it("labels only the hours while no division has room", () => {
		expect(gridAt(56, MEASURES)).toEqual({ labels: 60, lines: 60 });
	});

	it("labels the finest division whose lines stand far enough apart", () => {
		expect(gridAt(80, MEASURES)).toEqual({ labels: 30, lines: 30 });
		expect(gridAt(160, MEASURES)).toEqual({ labels: 15, lines: 15 });
		expect(gridAt(480, MEASURES)).toEqual({ labels: 5, lines: 5 });
	});

	it("adds bare lines once they stand apart", () => {
		expect(gridAt(192, MEASURES)).toEqual({ labels: 15, lines: 5 });
	});

	it("takes the frontend's measures as they are", () => {
		expect(gridAt(56, { divisions: [30], labelGap: 20, tickMinutes: 10, tickGap: 100 })).toEqual({ labels: 30, lines: 30 });
	});
});

describe("gridMarks", () => {
	it("is nothing when only the hours are drawn", () => {
		expect(gridMarks({ labels: 60, lines: 60 }, 24)).toEqual([]);
	});

	it("marks every line between the hours, minutes counted from the day's start, and labels the labelled ones", () => {
		expect(gridMarks({ labels: 30, lines: 15 }, 2)).toEqual([
			{ minute: 15, label: null },
			{ minute: 30, label: ":30" },
			{ minute: 45, label: null },
			{ minute: 75, label: null },
			{ minute: 90, label: ":30" },
			{ minute: 105, label: null },
		]);
	});

	it("writes a label in two digits", () => {
		expect(gridMarks({ labels: 5, lines: 5 }, 1)[0]).toEqual({ minute: 5, label: ":05" });
	});
});

import { describe, expect, it } from "vitest";
import { gridDivision, itemBox, layoutColumns } from "../../src/ui/timelineLayout";

describe("layoutColumns", () => {
	it("gives a lone event the whole width", () => {
		expect(layoutColumns([{ start: 540, end: 600 }])).toEqual([{ col: 0, cols: 1 }]);
	});

	it("splits two overlapping events into two columns, in order of start", () => {
		expect(layoutColumns([{ start: 900, end: 990 }, { start: 930, end: 960 }])).toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }]);
	});

	it("keeps a chain in one cluster: the third overlaps the second but not the first", () => {
		const boxes = layoutColumns([{ start: 600, end: 660 }, { start: 630, end: 720 }, { start: 690, end: 750 }]);
		expect(boxes.map((b) => b.cols)).toEqual([2, 2, 2]);
		expect(boxes.map((b) => b.col)).toEqual([0, 1, 0]);
	});

	it("starts a new cluster when nothing overlaps any more, and touching ends do not overlap", () => {
		const boxes = layoutColumns([{ start: 600, end: 660 }, { start: 660, end: 720 }, { start: 700, end: 760 }]);
		expect(boxes).toEqual([{ col: 0, cols: 1 }, { col: 0, cols: 2 }, { col: 1, cols: 2 }]);
	});

	it("answers in the order given, whatever the order of starts", () => {
		expect(layoutColumns([{ start: 930, end: 960 }, { start: 900, end: 990 }])).toEqual([{ col: 1, cols: 2 }, { col: 0, cols: 2 }]);
	});
});

describe("itemBox", () => {
	it("lays a block one pixel under its start and two pixels short of its end", () => {
		expect(itemBox(660, 720, 56)).toEqual({ top: 617, height: 54, tiny: false });
		expect(itemBox(540, 555, 56)).toEqual({ top: 505, height: 12, tiny: true });
	});

	it("calls a block tiny under 24 px", () => {
		expect(itemBox(0, 30, 56).tiny).toBe(false);
		expect(itemBox(0, 30, 28).tiny).toBe(true);
	});
});

describe("gridDivision", () => {
	it("draws only the hours up to the base zoom: half an hour there is too close for a label", () => {
		expect(gridDivision(28)).toBe(60);
		expect(gridDivision(56)).toBe(60);
	});

	it("adds the half hours once they have room, then the quarters, then every five minutes", () => {
		expect(gridDivision(80)).toBe(30);
		expect(gridDivision(112)).toBe(30);
		expect(gridDivision(160)).toBe(15);
		expect(gridDivision(224)).toBe(15);
		expect(gridDivision(480)).toBe(5);
	});
});

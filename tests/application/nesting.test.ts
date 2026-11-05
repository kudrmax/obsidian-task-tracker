import { describe, expect, it } from "vitest";
import type { TaskKey } from "../../src/application/contracts";
import { type GapPlace, gapOfPlace, levelRange, type ListCard, fitLevel, placeOfGap, shiftLevel } from "../../src/application/nesting";

const key = (index: number, path: number[] = []): TaskKey => ({ section: "now", index, path, raw: `${index}${path.join("")}` });
/** A, its subtasks A0 and A1, A1's subtask A10, then B. */
const CARDS: ListCard[] = [
	{ key: key(0), level: 0 },
	{ key: key(0, [0]), level: 1 },
	{ key: key(0, [1]), level: 1 },
	{ key: key(0, [1, 0]), level: 2 },
	{ key: key(1), level: 0 },
].map((c) => ({ ...c, group: null }));

describe("what a gap means", () => {
	it("makes a task of a card dropped at the first level, before the next task", () => {
		expect(placeOfGap(CARDS, { kind: "gap", index: 4, level: 0, group: null })).toEqual({ kind: "task", group: null, before: key(1) });
		expect(placeOfGap(CARDS, { kind: "gap", index: 5, level: 0, group: null })).toEqual({ kind: "task", group: null, before: null });
	});

	it("makes a subtask of the nearest card a level up, before the next one at its level", () => {
		expect(placeOfGap(CARDS, { kind: "gap", index: 2, level: 1, group: null })).toEqual({ kind: "subtask", parent: key(0), before: key(0, [1]) });
		expect(placeOfGap(CARDS, { kind: "gap", index: 4, level: 1, group: null })).toEqual({ kind: "subtask", parent: key(0), before: null });
		expect(placeOfGap(CARDS, { kind: "gap", index: 4, level: 3, group: null })).toEqual({ kind: "subtask", parent: key(0, [1, 0]), before: null });
	});
});

describe("the level a place may take", () => {
	/** A and its subtask A0 outside any section, then the header X and its task B. */
	const SECTIONED: ListCard[] = [
		{ key: key(0), level: 0, group: null },
		{ key: key(0, [0]), level: 1, group: null },
		{ key: key(1), level: 0, group: "X" },
	];
	const gapAt = (index: number, level: number, group: GapPlace["group"] = null): GapPlace => ({ kind: "gap", index, level, group });

	it("is none under a header, where the first card is a task", () => {
		expect(levelRange(SECTIONED, 2, "X")).toEqual({ min: 0, max: 0 });
	});

	it("runs from the card below to one under the card above", () => {
		expect(levelRange(SECTIONED, 2, null)).toEqual({ min: 0, max: 2 });
		expect(levelRange(CARDS, 2, null)).toEqual({ min: 1, max: 2 });
	});

	it("is none for the first card", () => {
		expect(levelRange(CARDS, 0, null)).toEqual({ min: 0, max: 0 });
	});

	it("shifts a place one level deeper or shallower while the range allows", () => {
		expect(shiftLevel(SECTIONED, gapAt(2, 1), 1)).toEqual(gapAt(2, 2));
		expect(shiftLevel(SECTIONED, gapAt(2, 1), -1)).toEqual(gapAt(2, 0));
	});

	it("refuses a shift out of the range", () => {
		expect(shiftLevel(SECTIONED, gapAt(2, 2), 1)).toBeNull();
		expect(shiftLevel(SECTIONED, gapAt(2, 0), -1)).toBeNull();
		expect(shiftLevel(SECTIONED, gapAt(2, 0, "X"), 1)).toBeNull();
		expect(shiftLevel(CARDS, gapAt(2, 1), -1)).toBeNull();
	});

	it("fits a place to the nearest level the range allows", () => {
		expect(fitLevel(SECTIONED, gapAt(2, 5))).toEqual(gapAt(2, 2));
		expect(fitLevel(CARDS, gapAt(2, 0))).toEqual(gapAt(2, 1));
		expect(fitLevel(SECTIONED, gapAt(2, 1, "X"))).toEqual(gapAt(2, 0, "X"));
		expect(fitLevel(SECTIONED, gapAt(2, 1))).toEqual(gapAt(2, 1));
	});
});

describe("the gap a result means", () => {
	const sectioned: ListCard[] = [
		{ key: key(0), level: 0, group: null },
		{ key: key(1), level: 0, group: "X" },
		{ key: key(1, [0]), level: 1, group: "X" },
		{ key: key(2), level: 0, group: "Y" },
	];

	it("reads back every gap placeOfGap writes from, as the same result", () => {
		const gaps: GapPlace[] = [];
		for (let index = 0; index <= CARDS.length; index++) {
			const { min, max } = levelRange(CARDS, index, null);
			for (let level = min; level <= max; level++) gaps.push({ kind: "gap", index, level, group: null });
		}
		for (const gap of gaps) expect(placeOfGap(CARDS, gapOfPlace(CARDS, placeOfGap(CARDS, gap)))).toEqual(placeOfGap(CARDS, gap));
	});

	it("puts a task with nothing after it at the end of its section", () => {
		expect(gapOfPlace(sectioned, { kind: "task", group: "X", before: null })).toEqual({ kind: "gap", index: 3, level: 0, group: "X" });
		expect(gapOfPlace(sectioned, { kind: "task", group: null, before: null })).toEqual({ kind: "gap", index: 1, level: 0, group: null });
	});

	it("puts a task in a section with no card at the top for the tasks outside any, at the end for another", () => {
		expect(gapOfPlace(sectioned.slice(1), { kind: "task", group: null, before: null })).toEqual({ kind: "gap", index: 0, level: 0, group: null });
		expect(gapOfPlace(sectioned, { kind: "task", group: "Z", before: null })).toEqual({ kind: "gap", index: 4, level: 0, group: "Z" });
	});

	it("puts a last subtask after the whole of its task's subtree, a level under it", () => {
		expect(gapOfPlace(CARDS, { kind: "subtask", parent: key(0), before: null })).toEqual({ kind: "gap", index: 4, level: 1, group: null });
		expect(gapOfPlace(sectioned, { kind: "subtask", parent: key(1), before: null })).toEqual({ kind: "gap", index: 3, level: 1, group: "X" });
	});

	it("puts a place before a card right before it, at its level", () => {
		expect(gapOfPlace(CARDS, { kind: "subtask", parent: key(0), before: key(0, [1]) })).toEqual({ kind: "gap", index: 2, level: 1, group: null });
		expect(gapOfPlace(sectioned, { kind: "task", group: "Y", before: key(2) })).toEqual({ kind: "gap", index: 3, level: 0, group: "Y" });
	});
});

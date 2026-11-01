import { describe, expect, it } from "vitest";
import type { TaskKey } from "../../src/application/contracts";
import { type GapPlace, type PlacedCard, fitLevel, levelRange, placeAt, resultOf, shiftLevel } from "../../src/ui/drag/listPlace";

const H = 35;
const STEP = 37;
const key = (index: number, path: number[] = []): TaskKey => ({ section: "now", index, path, raw: `${index}${path.join("")}` });
/** A, its subtasks A0 and A1, A1's subtask A10, then B. */
const CARDS: PlacedCard[] = [
	{ key: key(0), level: 0 },
	{ key: key(0, [0]), level: 1 },
	{ key: key(0, [1]), level: 1 },
	{ key: key(0, [1, 0]), level: 2 },
	{ key: key(1), level: 0 },
].map((c, i) => ({ ...c, top: i * STEP, height: H, group: null }));

describe("placeAt", () => {
	const gap = (index: number) => ({ kind: "gap", index, level: 0, group: null }) as const;

	it("opens the gap where the finger is, at the level its edge picks within what the neighbours allow", () => {
		expect(placeAt(CARDS, 2 * STEP - 1, 1, STEP, gap(5))).toEqual({ kind: "gap", index: 2, level: 1, group: null });
		expect(placeAt(CARDS, 2 * STEP - 1, 5, STEP, gap(5))).toEqual({ kind: "gap", index: 2, level: 2, group: null });
		expect(placeAt(CARDS, 2 * STEP - 1, -3, STEP, gap(5))).toEqual({ kind: "gap", index: 2, level: 1, group: null });
		expect(placeAt(CARDS, -10, 3, STEP, gap(5))).toEqual({ kind: "gap", index: 0, level: 0, group: null });
		expect(placeAt(CARDS, 9 * STEP, 9, STEP, gap(5))).toEqual({ kind: "gap", index: 5, level: 1, group: null });
	});

	it("keeps the gap where the card was lifted while the finger stays about there", () => {
		const lifted = 4 * STEP + H / 2;
		expect(placeAt(CARDS, lifted + 3, 0, STEP, gap(4))).toEqual(gap(4));
		expect(placeAt(CARDS, lifted - 3, 0, STEP, gap(4))).toEqual(gap(4));
	});

	it("takes a card in over its middle as it stands, and opens the gap on past it", () => {
		expect(placeAt(CARDS, 4 * STEP + H / 2 + STEP, 0, STEP, gap(4))).toEqual({ kind: "into", index: 4 });
		expect(placeAt(CARDS, 4 * STEP + H * 0.3, 0, STEP, { kind: "into", index: 4 })).toEqual({ kind: "into", index: 4 });
		expect(placeAt(CARDS, 4 * STEP + H * 0.9, 0, STEP, { kind: "into", index: 4 })).toEqual(gap(5));
		expect(placeAt(CARDS, 4 * STEP + H * 0.1, 0, STEP, { kind: "into", index: 4 })).toEqual(gap(4));
	});
});

describe("resultOf", () => {
	it("makes a task of a card dropped at the first level, before the next task", () => {
		expect(resultOf(CARDS, { kind: "gap", index: 4, level: 0, group: null })).toEqual({ kind: "task", group: null, before: key(1) });
		expect(resultOf(CARDS, { kind: "gap", index: 5, level: 0, group: null })).toEqual({ kind: "task", group: null, before: null });
	});

	it("makes a subtask of the nearest card a level up, before the next one at its level", () => {
		expect(resultOf(CARDS, { kind: "gap", index: 2, level: 1, group: null })).toEqual({ kind: "subtask", parent: key(0), before: key(0, [1]) });
		expect(resultOf(CARDS, { kind: "gap", index: 4, level: 1, group: null })).toEqual({ kind: "subtask", parent: key(0), before: null });
		expect(resultOf(CARDS, { kind: "gap", index: 4, level: 3, group: null })).toEqual({ kind: "subtask", parent: key(0, [1, 0]), before: null });
		expect(resultOf(CARDS, { kind: "into", index: 4 })).toEqual({ kind: "subtask", parent: key(1), before: null });
	});
});

describe("sections in the list", () => {
	/** A and its subtask A0 outside any section, then the header X and its task B. */
	const SECTIONED: PlacedCard[] = [
		{ key: key(0), level: 0, top: 0, height: H, group: null },
		{ key: key(0, [0]), level: 1, top: STEP, height: H, group: null },
		{ key: key(1), level: 0, top: 106, height: H, group: "X" },
	];
	const HEADS = [
		{ group: null, firstCard: 0, top: -26, height: 26 },
		{ group: "X", firstCard: 2, top: 80, height: 26 },
	];
	const none = { kind: "gap", index: 3, level: 0, group: null } as const;

	it("above a header's middle the gap ends the section before it, where a subtask may go", () => {
		const place = placeAt(SECTIONED, 85, 5, STEP, none, HEADS);
		expect(place).toEqual({ kind: "gap", index: 2, level: 2, group: null });
		expect(resultOf(SECTIONED, place)).toEqual({ kind: "subtask", parent: key(0, [0]), before: null });
	});

	it("below it the gap starts the section, and the header breaks nesting", () => {
		const place = placeAt(SECTIONED, 100, 5, STEP, none, HEADS);
		expect(place).toEqual({ kind: "gap", index: 2, level: 0, group: "X" });
		expect(resultOf(SECTIONED, place)).toEqual({ kind: "task", group: "X", before: key(1) });
	});

	it("above the first header, with no task outside any section, the gap is the hidden No section", () => {
		const onlyX = [{ key: key(1), level: 0, top: 26, height: H, group: "X" }];
		const place = placeAt(onlyX, 5, 0, STEP, { kind: "gap", index: 1, level: 0, group: "X" }, [{ group: "X", firstCard: 0, top: 0, height: 26 }]);
		expect(resultOf(onlyX, place)).toEqual({ kind: "task", group: null, before: null });
	});
});

describe("leaving a section when no task is outside any", () => {
	const ONLY_X: PlacedCard[] = [{ key: key(1), level: 0, top: 26, height: H, group: "X" }];
	const HEAD_X = [{ group: "X", firstCard: 0, top: 0, height: 26 }];
	const inX = { kind: "gap", index: 1, level: 0, group: "X" } as const;

	it("anywhere over the first header puts the card in No section, not only above its middle", () => {
		const place = placeAt(ONLY_X, 22, 0, STEP, inX, HEAD_X);
		expect(resultOf(ONLY_X, place)).toEqual({ kind: "task", group: null, before: null });
	});

	it("with the gap open above the header it stays there while the finger is over the header", () => {
		const open = { kind: "gap", index: 0, level: 0, group: null } as const;
		expect(placeAt(ONLY_X, STEP + 20, 0, STEP, open, HEAD_X)).toEqual(open);
	});

	it("the last card of the only section, lifted, can still leave it", () => {
		const place = placeAt([], 10, 0, STEP, { kind: "gap", index: 0, level: 0, group: "X" }, HEAD_X);
		expect(place).toEqual({ kind: "gap", index: 0, level: 0, group: null });
	});
});

describe("the level a place may take", () => {
	/** A and its subtask A0 outside any section, then the header X and its task B. */
	const SECTIONED: PlacedCard[] = [
		{ key: key(0), level: 0, top: 0, height: H, group: null },
		{ key: key(0, [0]), level: 1, top: STEP, height: H, group: null },
		{ key: key(1), level: 0, top: 106, height: H, group: "X" },
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

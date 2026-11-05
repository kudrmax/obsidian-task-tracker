import { describe, expect, it } from "vitest";
import { placeOfGap, type TaskKey } from "../../src/application/contracts";
import { type PlacedCard, placeAt, sameGap } from "../../src/ui/drag/listPlace";

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

	describe("hysteresis: the place shown keeps a finger that trembles at its edge", () => {
		const HOLD = 6;
		/** B's middle, with the gap before A10 open: B stands a step lower. The edge between the gaps before and after B. */
		const edge = 4 * STEP + STEP + H / 2;

		it("keeps the place shown until the finger is more than the hysteresis past its edge", () => {
			expect(placeAt(CARDS, edge + 2, 0, STEP, gap(4), [], gap(4), HOLD)).toEqual(gap(4));
			expect(placeAt(CARDS, edge + HOLD + 1, 0, STEP, gap(4), [], gap(4), HOLD)).toEqual(gap(5));
		});

		it("holds the gap past a card the same way when the finger comes back over its middle", () => {
			expect(placeAt(CARDS, edge - 2, 0, STEP, gap(4), [], gap(5), HOLD)).toEqual(gap(5));
			expect(placeAt(CARDS, edge - HOLD - 1, 0, STEP, gap(4), [], gap(5), HOLD)).toEqual(gap(4));
		});

		it("lets a fast finger, far past the edge, take the new place at once", () => {
			expect(placeAt(CARDS, -20, 0, STEP, gap(4), [], gap(4), HOLD)).toEqual(gap(0));
		});

		it("lets the level of a held gap follow the finger", () => {
			const held = { kind: "gap", index: 4, level: 0, group: null } as const;
			const place = placeAt(CARDS, 4 * STEP + 2, 1, STEP, held, [], held, HOLD);
			expect(place).toEqual({ ...held, level: 1 });
		});

		it("sees one place in two that differ only by level", () => {
			expect(sameGap({ kind: "gap", index: 2, level: 0, group: null }, { kind: "gap", index: 2, level: 1, group: null })).toBe(true);
			expect(sameGap({ kind: "gap", index: 2, level: 0, group: null }, { kind: "gap", index: 3, level: 0, group: null })).toBe(false);
		});
	});

	it("never goes into a card: over one the finger picks the gap nearer it, against the room left open", () => {
		expect(placeAt(CARDS, 4 * STEP + STEP + H * 0.4, 0, STEP, gap(4))).toEqual(gap(4));
		expect(placeAt(CARDS, 4 * STEP + STEP + H * 0.6, 0, STEP, gap(4))).toEqual(gap(5));
	});

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
		expect(placeOfGap(SECTIONED, place)).toEqual({ kind: "subtask", parent: key(0, [0]), before: null });
	});

	it("below it the gap starts the section, and the header breaks nesting", () => {
		const place = placeAt(SECTIONED, 100, 5, STEP, none, HEADS);
		expect(place).toEqual({ kind: "gap", index: 2, level: 0, group: "X" });
		expect(placeOfGap(SECTIONED, place)).toEqual({ kind: "task", group: "X", before: key(1) });
	});

	it("above the first header, with no task outside any section, the gap is the hidden No section", () => {
		const onlyX = [{ key: key(1), level: 0, top: 26, height: H, group: "X" }];
		const place = placeAt(onlyX, 5, 0, STEP, { kind: "gap", index: 1, level: 0, group: "X" }, [{ group: "X", firstCard: 0, top: 0, height: 26 }]);
		expect(placeOfGap(onlyX, place)).toEqual({ kind: "task", group: null, before: null });
	});
});

describe("leaving a section when no task is outside any", () => {
	const ONLY_X: PlacedCard[] = [{ key: key(1), level: 0, top: 26, height: H, group: "X" }];
	const HEAD_X = [{ group: "X", firstCard: 0, top: 0, height: 26 }];
	const inX = { kind: "gap", index: 1, level: 0, group: "X" } as const;

	it("anywhere over the first header puts the card in No section, not only above its middle", () => {
		const place = placeAt(ONLY_X, 22, 0, STEP, inX, HEAD_X);
		expect(placeOfGap(ONLY_X, place)).toEqual({ kind: "task", group: null, before: null });
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

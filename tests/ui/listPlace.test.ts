import { describe, expect, it } from "vitest";
import type { TaskKey } from "../../src/application/contracts";
import { type PlacedCard, placeAt, resultOf } from "../../src/ui/drag/listPlace";

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
].map((c, i) => ({ ...c, top: i * STEP, height: H }));

describe("placeAt", () => {
	it("opens the gap where the finger is, at the level its edge picks within what the neighbours allow", () => {
		expect(placeAt(CARDS, 2 * STEP - 1, 1, STEP)).toEqual({ kind: "gap", index: 2, level: 1 });
		expect(placeAt(CARDS, 2 * STEP - 1, 5, STEP)).toEqual({ kind: "gap", index: 2, level: 2 });
		expect(placeAt(CARDS, 2 * STEP - 1, -3, STEP)).toEqual({ kind: "gap", index: 2, level: 1 });
		expect(placeAt(CARDS, 4 * STEP - 1, 0.4, STEP)).toEqual({ kind: "gap", index: 4, level: 0 });
		expect(placeAt(CARDS, -10, 3, STEP)).toEqual({ kind: "gap", index: 0, level: 0 });
		expect(placeAt(CARDS, 9 * STEP, 9, STEP)).toEqual({ kind: "gap", index: 5, level: 1 });
	});

	it("takes the card in when the finger is over its middle as it stands, the gap open before it or not", () => {
		expect(placeAt(CARDS, 4 * STEP + H * 0.6, 0, STEP)).toEqual({ kind: "into", index: 4 });
		expect(placeAt(CARDS, 4 * STEP + H * 0.4, 0, STEP)).toEqual({ kind: "gap", index: 4, level: 0 });
	});
});

describe("resultOf", () => {
	it("makes a task of a card dropped at the first level, before the next task", () => {
		expect(resultOf(CARDS, { kind: "gap", index: 4, level: 0 })).toEqual({ kind: "task", before: key(1) });
		expect(resultOf(CARDS, { kind: "gap", index: 5, level: 0 })).toEqual({ kind: "task", before: null });
	});

	it("makes a subtask of the nearest card a level up, before the next one at its level", () => {
		expect(resultOf(CARDS, { kind: "gap", index: 2, level: 1 })).toEqual({ kind: "subtask", parent: key(0), before: key(0, [1]) });
		expect(resultOf(CARDS, { kind: "gap", index: 4, level: 1 })).toEqual({ kind: "subtask", parent: key(0), before: null });
		expect(resultOf(CARDS, { kind: "gap", index: 4, level: 3 })).toEqual({ kind: "subtask", parent: key(0, [1, 0]), before: null });
		expect(resultOf(CARDS, { kind: "into", index: 4 })).toEqual({ kind: "subtask", parent: key(1), before: null });
	});
});

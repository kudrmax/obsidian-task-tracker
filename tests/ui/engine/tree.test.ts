import { describe, expect, it } from "vitest";
import { descendantsOf, finalOrder, levelAt, levelBetween, spotKey, SWIPE_REST_MS, SWIPE_STEP, shiftOf, slotOf, SwipeLevel } from "../../../obsidian/ui/engine/drag/tree";
import type { Row } from "../../../obsidian/ui/engine/port";
import { coreLevels } from "./coreRules";

const task = (id: string, depth = 0): Row => ({ kind: "task", id, depth });

describe("a carried card's level where it stands", () => {
	const rows = [task("a"), task("b"), task("b1", 1), task("b2", 1), task("c")];

	it("no deeper than one under the row above its place", () => {
		expect(levelAt(coreLevels, rows, "c", "c", 5)).toBe(2);
		expect(levelAt(coreLevels, rows, "b", "b", 5)).toBe(1);
	});
	it("no shallower than the subtask below its place", () => {
		expect(levelBetween(coreLevels, task("b"), task("b1", 1), 0)).toBe(1);
	});
	it("at the top of a list, or right under a section's header, a task", () => {
		expect(levelAt(coreLevels, rows, "c", "a", 3)).toBe(0);
		expect(levelBetween(coreLevels, { kind: "section", id: "s", title: "Идеи" }, task("x"), 3)).toBe(0);
	});
	it("takes the level asked for where it now stands", () => {
		expect(levelAt(coreLevels, rows, "a", "b2", 2)).toBe(2);
		expect(levelAt(coreLevels, rows, "a", "b2", 0)).toBe(0);
	});
});

describe("where a card stands among a list's rows", () => {
	const rows: Row[] = [task("a"), { kind: "section", id: "s1", title: "Идеи" }, task("x"), { kind: "section", id: "s2", title: "Пустая" }];
	it("right after an empty section's header: in that section, at its end", () => {
		expect(slotOf(rows, ["a", "s1", "x", "s2", "c"], "c")).toEqual({ section: "s2", before: null });
	});
	it("before a header: at the end of the section above", () => {
		expect(slotOf(rows, ["a", "s1", "x", "c", "s2"], "c")).toEqual({ section: "s1", before: null });
	});
});

describe("a carried card's subtasks", () => {
	it("are the rows under it, deeper than it", () => {
		const rows = [task("a"), task("a1", 1), task("a2", 2), task("a3", 1), task("b")];
		expect([...descendantsOf(rows, "a")]).toEqual(["a1", "a2", "a3"]);
		expect([...descendantsOf(rows, "a1")]).toEqual(["a2"]);
		expect([...descendantsOf(rows, "b")]).toEqual([]);
	});
});

describe("the list's final order while a card is held (the sorting strategy)", () => {
	const rows: Row[] = [task("a"), task("b"), { kind: "section", id: "s", title: "Пустая" }, { kind: "section", id: "t", title: "Дальше" }, task("x")];
	const ids = rows.map((row) => row.id);
	it("is dnd-kit's: the card moves to where it stands, an empty section's header like any row", () => {
		expect(finalOrder(ids, 0, 2)).toEqual(["b", "s", "a", "t", "x"]);
		expect(finalOrder(ids, 0, 1)).toEqual(["b", "a", "s", "t", "x"]);
	});
	it("while held, the rows stand where the list will be: the card right under the empty section's header, the next section right under the card", () => {
		const final = finalOrder(ids, 0, 2);
		const height = (id: string) => (id === "s" || id === "t" ? 26 : 37);
		const top = (id: string) => ids.slice(0, ids.indexOf(id)).reduce((sum, other) => sum + height(other), 0) + shiftOf(id, ids, final, height);
		expect(top("b")).toBe(0);
		expect(top("s")).toBe(37);
		expect(top("a")).toBe(37 + 26);
		expect(top("t")).toBe(37 + 26 + 37);
		expect(top("x")).toBe(37 + 26 + 37 + 26);
	});
});

/**
 * Max, 2026-11-18: «the level hangs not on where the mouse is but on a swipe: on a new place the card is a task right
 * there; a swipe right makes it a subtask, a swipe left a task again; 500 right a subtask, 40 left a task, 1000 right a
 * subtask again». The level is the swipes on the place the card stands at, never the hand's position.
 */
describe("the carried card's level by swipes on its place (Max, 2026-11-18)", () => {
	const upTo = (deepest: number, shallowest = 0) => (wanted: number) => Math.max(shallowest, Math.min(deepest, wanted));
	/** A hand: it comes to `spot` at `x` and rests there, then each move is a moment after the one before. */
	const hand = (level: SwipeLevel, spot: string, x: number, allowed = upTo(1)) => {
		let now = 1000;
		level.at(x, now, spot, allowed);
		now += SWIPE_REST_MS;
		return (to: number, where = spot, allows = allowed) => level.at(to, (now += 16), where, allows);
	};
	it("on a new place a task; a swipe right a subtask, a swipe left a task again", () => {
		const move = hand(new SwipeLevel(null, 0, 0, 0), "p", 300);
		expect(move(300 + SWIPE_STEP - 1)).toBe(0);
		expect(move(300 + SWIPE_STEP)).toBe(1);
		expect(move(300)).toBe(0);
	});
	it("Max's hand: 500 right, 40 left, 1000 right, 40 left", () => {
		const move = hand(new SwipeLevel(null, 0, 0, 0), "p", 100);
		expect(move(600)).toBe(1);
		expect(move(560)).toBe(0);
		expect(move(1560)).toBe(1);
		expect(move(1520)).toBe(0);
	});
	it("past the deepest level nothing builds up, however the hand gets there: a short step back is one level back", () => {
		for (const far of [62, 77.5, 81.5, 99]) {
			const move = hand(new SwipeLevel(null, 0, 0, 0), "p", 100, upTo(2));
			for (let x = 100; x < 100 + far; x += 3.2) move(x);
			expect(move(100 + far)).toBe(2);
			expect(move(100 + far - SWIPE_STEP - 10)).toBe(1);
		}
	});
	it("the way to a place is no swipe: a hand still moving right as it comes onto it, then resting, leaves a task", () => {
		const level = new SwipeLevel(null, 0, 0, 0);
		expect(level.at(100, 1000, "p", upTo(1))).toBe(0);
		expect(level.at(140, 1016, "p", upTo(1))).toBe(0);
		expect(level.at(180, 1032, "p", upTo(1))).toBe(0);
		expect(level.at(180, 1032 + SWIPE_REST_MS, "p", upTo(1))).toBe(0);
		expect(level.at(180 + SWIPE_STEP, 1032 + SWIPE_REST_MS + 16, "p", upTo(1))).toBe(1);
	});
	it("where the hand is does not matter: a place reached far to the right starts as a task", () => {
		const move = hand(new SwipeLevel(null, 0, 0, 0), "p", 100);
		expect(move(900, "q")).toBe(0);
	});
	it("a new place starts again: what the hand swiped on the place before does not carry over", () => {
		const move = hand(new SwipeLevel(null, 0, 0, 0), "p", 100);
		expect(move(100 + SWIPE_STEP)).toBe(1);
		expect(move(100 + SWIPE_STEP, "q")).toBe(0);
	});
	it("a place under a subtask's parent makes it a subtask from the start: the task of the row below", () => {
		expect(new SwipeLevel(null, 0, 0, 0).at(100, 1000, "p", upTo(1, 1))).toBe(1);
	});
	it("on its own place a card keeps its own level, and its moves count from where it was lifted", () => {
		const level = new SwipeLevel("home", 1, 100, 1000);
		expect(level.at(100 - SWIPE_STEP + 5, 1000 + SWIPE_REST_MS + 50, "home", upTo(2))).toBe(1);
		expect(level.at(100 - SWIPE_STEP, 1000 + SWIPE_REST_MS + 66, "home", upTo(2))).toBe(0);
	});
	it("two steps in one move are two levels, as deep as the place allows", () => {
		const move = hand(new SwipeLevel(null, 0, 0, 0), "p", 100, upTo(3));
		expect(move(100 + SWIPE_STEP * 2)).toBe(2);
	});
	it("a spot is named by its neighbours", () => {
		expect(spotKey("inbox", ["a", "x", "b"], "x")).toBe("inbox|a|b");
		expect(spotKey("inbox", ["x"], "x")).toBe("inbox||");
	});
});

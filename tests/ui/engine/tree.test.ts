import { describe, expect, it } from "vitest";
import { descendantsOf, finalOrder, levelAt, levelBetween, SHIFT_BACK, SHIFT_STEP, shiftOf, slotOf, stickyShift } from "../../../obsidian/ui/engine/drag/tree";
import type { Row } from "../../../obsidian/ui/engine/port";

const task = (id: string, depth = 0): Row => ({ kind: "task", id, depth });

describe("the sideways shift (Max, 2026-11-18: a coarser step, a sticky edge)", () => {
	it("a step to the right is one level deeper, two steps two", () => {
		expect(stickyShift(0, SHIFT_STEP - 1)).toBe(0);
		expect(stickyShift(0, SHIFT_STEP)).toBe(1);
		expect(stickyShift(0, SHIFT_STEP * 2)).toBe(2);
	});
	it("a level taken holds until the hand comes back near where the one before held", () => {
		expect(stickyShift(1, SHIFT_STEP - 5)).toBe(1);
		expect(stickyShift(1, SHIFT_BACK)).toBe(1);
		expect(stickyShift(1, SHIFT_BACK - 1)).toBe(0);
	});
	it("to the left the same way, shallower", () => {
		expect(stickyShift(0, -SHIFT_STEP)).toBe(-1);
		expect(stickyShift(-1, -SHIFT_BACK)).toBe(-1);
		expect(stickyShift(-1, -SHIFT_BACK + 1)).toBe(0);
	});
});

describe("a carried card's level where it stands", () => {
	const rows = [task("a"), task("b"), task("b1", 1), task("b2", 1), task("c")];

	it("no deeper than one under the row above its place", () => {
		expect(levelAt(rows, "c", "c", 5)).toBe(2);
		expect(levelAt(rows, "b", "b", 5)).toBe(1);
	});
	it("no shallower than the subtask below its place", () => {
		expect(levelBetween(task("b"), task("b1", 1), 0)).toBe(1);
	});
	it("at the top of a list, or right under a section's header, a task", () => {
		expect(levelAt(rows, "c", "a", 3)).toBe(0);
		expect(levelBetween({ kind: "section", id: "s", title: "Идеи" }, task("x"), 3)).toBe(0);
	});
	it("takes the level asked for where it now stands", () => {
		expect(levelAt(rows, "a", "b2", 2)).toBe(2);
		expect(levelAt(rows, "a", "b2", 0)).toBe(0);
	});
});

describe("where a card stands among a list's rows", () => {
	const rows: Row[] = [task("a"), { kind: "section", id: "s1", title: "Идеи" }, task("x"), { kind: "section", id: "s2", title: "Пустая" }, { kind: "empty", id: "e", section: "s2", label: "No tasks" }];
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
	const rows: Row[] = [task("a"), task("b"), { kind: "section", id: "s", title: "Пустая" }, { kind: "empty", id: "e", section: "s", label: "No tasks" }, { kind: "section", id: "t", title: "Дальше" }, task("x")];
	const ids = rows.map((row) => row.id);
	it("a card let go in an empty section takes its plate's room, the plate gone from the order", () => {
		expect(finalOrder(rows, ids, 0, 2)).toEqual(["b", "s", "a", "t", "x"]);
		expect(finalOrder(rows, ids, 0, 3)).toEqual(["b", "s", "a", "t", "x"]);
	});
	it("anywhere else the plate stays", () => {
		expect(finalOrder(rows, ids, 0, 1)).toEqual(["b", "a", "s", "e", "t", "x"]);
	});
	it("while held, the rows stand where the list will be: the card right under the empty section's header, the next section right under the card", () => {
		const final = finalOrder(rows, ids, 0, 2);
		const height = (id: string) => (id === "s" || id === "t" ? 26 : 37);
		const top = (id: string) => ids.slice(0, ids.indexOf(id)).reduce((sum, other) => sum + height(other), 0) + shiftOf(id, ids, final, height);
		expect(top("b")).toBe(0);
		expect(top("s")).toBe(37);
		expect(top("a")).toBe(37 + 26);
		expect(top("t")).toBe(37 + 26 + 37);
		expect(top("x")).toBe(37 + 26 + 37 + 26);
	});
});

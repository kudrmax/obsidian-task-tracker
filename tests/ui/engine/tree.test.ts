import { describe, expect, it } from "vitest";
import { descendantsOf, levelAt, levelBetween, zoneOf } from "../../../obsidian/ui/engine/drag/tree";
import type { Row } from "../../../obsidian/ui/engine/port";

const task = (id: string, depth = 0): Row => ({ kind: "task", id, depth });

describe("the zone across a list (Max, 2026-11-18: the right third makes a subtask)", () => {
	it("the left two thirds are a task's, the right third a subtask's", () => {
		expect(zoneOf(10, 0, 300)).toBe("task");
		expect(zoneOf(199, 0, 300)).toBe("task");
		expect(zoneOf(200, 0, 300)).toBe("subtask");
		expect(zoneOf(299, 0, 300)).toBe("subtask");
	});
});

describe("a carried card's level by the zone", () => {
	const rows = [task("a"), task("b"), task("b1", 1), task("b2", 1), task("c")];

	it("in the subtask zone it goes one level under the task above its place", () => {
		expect(levelAt(rows, "c", "c", "subtask")).toBe(2);
		expect(levelAt(rows, "b", "b", "subtask")).toBe(1);
	});
	it("in the task zone it is as shallow as its place allows", () => {
		expect(levelAt(rows, "c", "c", "task")).toBe(0);
		expect(levelAt(rows, "b2", "b2", "task")).toBe(0);
	});
	it("between a task and its subtask it can only be a sibling subtask", () => {
		expect(levelBetween(task("b"), task("b1", 1), "task")).toBe(1);
		expect(levelBetween(task("b"), task("b1", 1), "subtask")).toBe(1);
	});
	it("at the top of a list, or right under a section's header, it is a task", () => {
		expect(levelAt(rows, "c", "a", "subtask")).toBe(0);
		expect(levelBetween({ kind: "section", id: "s", title: "Идеи" }, task("x"), "subtask")).toBe(0);
	});
	it("takes the level where it now stands among the rows", () => {
		expect(levelAt(rows, "a", "b2", "subtask")).toBe(2);
		expect(levelAt(rows, "a", "b2", "task")).toBe(0);
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

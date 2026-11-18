import { describe, expect, it } from "vitest";
import { descendantsOf, projectDepth } from "../../../obsidian/ui/engine/drag/tree";
import type { Row } from "../../../obsidian/ui/engine/port";

const task = (id: string, depth = 0): Row => ({ kind: "task", id, depth });
const INDENT = 20;

describe("a carried card's level (dnd-kit's sortable tree projection)", () => {
	const rows = [task("a"), task("b"), task("b1", 1), task("b2", 1), task("c")];

	it("stays at its own level without a sideways move", () => {
		expect(projectDepth(rows, "c", "c", 0, INDENT, 0)).toBe(0);
	});
	it("goes one level deeper for an indent to the right, under the task above it", () => {
		expect(projectDepth(rows, "c", "c", INDENT, INDENT, 0)).toBe(1);
	});
	it("is never deeper than one under the row above it", () => {
		expect(projectDepth(rows, "c", "c", INDENT * 5, INDENT, 0)).toBe(2);
		expect(projectDepth(rows, "b", "b", INDENT * 3, INDENT, 0)).toBe(1);
	});
	it("is never shallower than the row below it", () => {
		expect(projectDepth(rows, "b1", "b1", -INDENT * 3, INDENT, 1)).toBe(1);
	});
	it("at the top of a list it is a task", () => {
		expect(projectDepth(rows, "c", "a", INDENT * 3, INDENT, 0)).toBe(0);
	});
	it("right under a section's header it is a task", () => {
		const sectioned: Row[] = [task("a"), { kind: "section", id: "s", title: "Идеи" }, task("x")];
		expect(projectDepth(sectioned, "x", "x", INDENT * 2, INDENT, 0)).toBe(0);
	});
	it("takes the level where it now stands among the rows", () => {
		expect(projectDepth(rows, "a", "b2", INDENT, INDENT, 0)).toBe(1);
		expect(projectDepth(rows, "a", "b2", INDENT * 2, INDENT, 0)).toBe(2);
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

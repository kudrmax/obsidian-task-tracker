import { describe, expect, it } from "vitest";
import { type PriorityLevel, sameLevels, usableLevels, usablePrefix } from "../../src/domain/Priority";

const LEVELS: readonly PriorityLevel[] = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
];

describe("priority levels", () => {
	it("take only a prefix that is one word", () => {
		expect(usablePrefix("p1")).toBe(true);
		expect(usablePrefix("!!")).toBe(true);
		expect(usablePrefix("")).toBe(false);
		expect(usablePrefix("p 1")).toBe(false);
	});

	it("drop a level without a usable prefix and the second of two with one prefix", () => {
		expect(usableLevels([
			{ prefix: "p1", color: "blue" },
			{ prefix: "", color: "green" },
			{ prefix: "p1", color: "red" },
			{ prefix: "p2", color: "orange" },
		])).toEqual([
			{ prefix: "p1", color: "blue" },
			{ prefix: "p2", color: "orange" },
		]);
	});

	it("tell levels apart by their content, not by the list they come in", () => {
		const copy = JSON.parse(JSON.stringify(LEVELS));
		expect(sameLevels(LEVELS, copy)).toBe(true);
		expect(sameLevels(LEVELS, [{ prefix: "p1", color: "blue" }, { prefix: "p2", color: "orange" }])).toBe(false);
		expect(sameLevels(LEVELS, LEVELS.slice(0, 1))).toBe(false);
	});
});

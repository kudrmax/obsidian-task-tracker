import { describe, expect, it } from "vitest";
import { hexColor, isBlankTitle, isPresetColor, type PriorityLevel, priorityOfText, priorityOfTitle, sameLevels, usableColor, usableLevels, usablePrefix, withPriority } from "../../src/domain/Priority";

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

describe("a priority prefix in a text", () => {
	const PREFIXES = ["p1", "p2"];

	it("is the first word when it is a level's prefix and whitespace follows it, the text what comes after", () => {
		expect(priorityOfText("p1 x", PREFIXES)).toEqual({ priority: "p1", text: "x" });
		expect(priorityOfText("p1\tx", PREFIXES)).toEqual({ priority: "p1", text: "x" });
		expect(priorityOfText("p1  x y", PREFIXES)).toEqual({ priority: "p1", text: "x y" });
		expect(priorityOfText("p1 ", PREFIXES)).toEqual({ priority: "p1", text: "" });
	});

	it("is none for a word alone, a word that only begins with it, another word, a leading space or no levels", () => {
		for (const text of ["p1", "p1x", "x", "p3 x", " p1 x", ""]) expect(priorityOfText(text, PREFIXES)).toEqual({ priority: null, text });
		expect(priorityOfText("p1 x", [])).toEqual({ priority: null, text: "p1 x" });
	});

	it("in a typed title is read off the line it is written as: the spaces before it and a line break do not hide it", () => {
		expect(priorityOfTitle("  p1 Взять зонт", PREFIXES)).toEqual({ priority: "p1", text: "Взять зонт" });
		expect(priorityOfTitle("\tp2 x\ny ", PREFIXES)).toEqual({ priority: "p2", text: "x y" });
		expect(priorityOfTitle(" x", PREFIXES)).toEqual({ priority: null, text: "x" });
		expect(withPriority("  p1 x", "p2", PREFIXES)).toBe("p2 x");
	});

	it("leaves nothing to write for no text or a prefix alone, but a prefix without its space is a text", () => {
		for (const text of ["", "  ", "p1 ", "p1\t", "p2   "]) expect(isBlankTitle(text, PREFIXES)).toBe(true);
		for (const text of ["p1", "p1 x", "p1x", "x", "p3 "]) expect(isBlankTitle(text, PREFIXES)).toBe(false);
	});

	it("puts another level first in place of the one typed, or takes it off", () => {
		expect(withPriority("p1 x", "p2", PREFIXES)).toBe("p2 x");
		expect(withPriority("p1  x", null, PREFIXES)).toBe("x");
		expect(withPriority("x", "p1", PREFIXES)).toBe("p1 x");
		expect(withPriority("p3 x", null, PREFIXES)).toBe("p3 x");
	});
});

describe("a colour a level may be drawn in", () => {
	it("is a preset or a code as the settings write it", () => {
		expect(["red", "#FF6A00"].map(usableColor)).toEqual([true, true]);
		expect(["#ff6a00", "FF6A00", " #FF6A00", "purple", "#FFF", "red; x"].map(usableColor)).toEqual([false, false, false, false, false, false]);
	});
});

describe("a colour's code", () => {
	it("reads six hex digits with or without the #, in any case", () => {
		expect(hexColor("ff6a00")).toBe("#FF6A00");
		expect(hexColor("#Ff6A00")).toBe("#FF6A00");
		expect(hexColor("  #ff6a00 ")).toBe("#FF6A00");
	});

	it("reads nothing else", () => {
		for (const text of ["", "#", "ff6a0", "ff6a000", "#gg6a00", "##ff6a00", "red"]) expect(hexColor(text), text).toBeNull();
	});

	it("tells a preset from a code", () => {
		expect(isPresetColor("teal")).toBe(true);
		expect(isPresetColor("#FF6A00")).toBe(false);
	});
});

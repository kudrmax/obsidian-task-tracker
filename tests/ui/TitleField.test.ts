// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { composingKey, oneLine } from "../../src/ui/quick/TitleField";

describe("oneLine", () => {
	it("reads a pasted line break, with the spaces around it, as one space, and leaves the rest as typed", () => {
		expect(oneLine("p1 Позвонить [[Петя]]\n  про договор")).toBe("p1 Позвонить [[Петя]] про договор");
		expect(oneLine("p1 ")).toBe("p1 ");
	});
});

describe("composingKey", () => {
	it("is a key of an input method composing, or the one iOS sends as it commits a candidate", () => {
		expect(composingKey(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }))).toBe(true);
		expect(composingKey(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229 }))).toBe(true);
		expect(composingKey(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13 }))).toBe(false);
	});
});

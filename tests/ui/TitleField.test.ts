// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { composingKey } from "../../obsidian/ui/quick/TitleField";

describe("composingKey", () => {
	it("is a key of an input method composing, or the one iOS sends as it commits a candidate", () => {
		expect(composingKey(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }))).toBe(true);
		expect(composingKey(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229 }))).toBe(true);
		expect(composingKey(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13 }))).toBe(false);
	});
});

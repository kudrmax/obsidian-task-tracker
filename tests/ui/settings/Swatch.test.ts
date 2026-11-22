// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Swatch } from "../../../obsidian/ui/settings/Swatch";

describe("Swatch", () => {
	it("is the plugin's round colour button, named for a screen reader, with its own purpose", () => {
		const swatch = new Swatch(document.body, { label: "red", cls: "tc-swatch-clear", onPress: () => undefined });
		expect(swatch.el.tagName).toBe("BUTTON");
		expect([...swatch.el.classList]).toEqual(["tc-btn", "is-swatch", "is-plain", "tc-swatch-clear"]);
		expect(swatch.el.getAttribute("aria-label")).toBe("red");
	});

	it("hands a click to onPress and marks itself on", () => {
		const onPress = vi.fn();
		const swatch = new Swatch(document.body, { label: "blue", onPress });
		swatch.el.click();
		expect(onPress).toHaveBeenCalledOnce();
		swatch.setOn(true);
		expect(swatch.el.classList.contains("is-on")).toBe(true);
		swatch.setOn(false);
		expect(swatch.el.classList.contains("is-on")).toBe(false);
	});
});

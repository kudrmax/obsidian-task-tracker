// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { clearCardSize, showCardSize } from "../../../obsidian/ui/paint/cardSize";

describe("cardSize", () => {
	afterEach(() => clearCardSize());

	it("puts the settings' size on the body, where the tokens built on it live", () => {
		showCardSize({ height: 44, gap: 6 });
		expect(document.body.style.getPropertyValue("--tc-card-h")).toBe("44px");
		expect(document.body.style.getPropertyValue("--tc-card-gap")).toBe("6px");
	});

	it("takes it off once cleared: the stylesheet's defaults count again", () => {
		showCardSize({ height: 44, gap: 6 });
		clearCardSize();
		expect(document.body.style.getPropertyValue("--tc-card-h")).toBe("");
		expect(document.body.style.getPropertyValue("--tc-card-gap")).toBe("");
	});
});

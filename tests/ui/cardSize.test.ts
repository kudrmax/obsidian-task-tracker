// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { clearCardSize, showCardSize, shownCardSize } from "../../src/ui/cardSize";

describe("cardSize", () => {
	afterEach(() => {
		clearCardSize();
		vi.restoreAllMocks();
	});

	it("gives the settings' defaults before any size is shown", () => {
		expect(shownCardSize()).toEqual({ height: DEFAULT_SETTINGS.cardHeight, gap: DEFAULT_SETTINGS.cardGap });
	});

	it("gives the size last shown without reading the styles", () => {
		const style = vi.spyOn(window, "getComputedStyle");
		showCardSize({ height: 44, gap: 6 });
		for (let i = 0; i < 100; i++) expect(shownCardSize()).toEqual({ height: 44, gap: 6 });
		expect(style).not.toHaveBeenCalled();
		expect(document.body.style.getPropertyValue("--tc-card-h")).toBe("44px");
	});

	it("goes back to the defaults once cleared", () => {
		showCardSize({ height: 44, gap: 6 });
		clearCardSize();
		expect(shownCardSize()).toEqual({ height: DEFAULT_SETTINGS.cardHeight, gap: DEFAULT_SETTINGS.cardGap });
		expect(document.body.style.getPropertyValue("--tc-card-h")).toBe("");
	});
});

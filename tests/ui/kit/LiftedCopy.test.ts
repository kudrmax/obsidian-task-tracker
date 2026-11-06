// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiftedCopy } from "../../../obsidian/ui/kit/LiftedCopy";
import { Overlay } from "../../../obsidian/ui/menu/Overlay";

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe("LiftedCopy", () => {
	it("stands in the rectangle it is pinned to, and keeps it", () => {
		const overlay = new Overlay(() => overlay.close());
		const rect = new DOMRect(5, 6, 70, 80);
		const copy = LiftedCopy.over(overlay, document.createElement("div"), true).pin(rect, { width: true, height: true });
		expect([copy.el.style.left, copy.el.style.top, copy.el.style.width, copy.el.style.height]).toEqual(["5px", "6px", "70px", "80px"]);
		expect(copy.rect).toBe(rect);
		expect(copy.el.parentElement?.className).toBe("tc-level");
	});

	it("off the level it stands on the page, and goes with the overlay", () => {
		vi.useFakeTimers();
		const overlay = new Overlay(() => overlay.close());
		const copy = LiftedCopy.over(overlay, document.createElement("div"), false).pin(new DOMRect(1, 2, 3, 4));
		expect(copy.el.parentElement).toBe(document.body);
		expect(copy.el.style.width).toBe("");
		overlay.close();
		vi.runAllTimers();
		expect(copy.el.isConnected).toBe(false);
	});
});

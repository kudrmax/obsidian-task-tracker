// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { placePanel } from "../../src/ui/menu/MenuPanel";

/** A panel 250 × 300 in layout, drawn smaller on screen while it grows in from scale(0.94). */
function growingPanel(): HTMLElement {
	const panel = document.createElement("div");
	Object.defineProperty(panel, "offsetWidth", { value: 250 });
	Object.defineProperty(panel, "offsetHeight", { value: 300 });
	panel.getBoundingClientRect = () => new DOMRect(0, 0, 235, 282);
	return panel;
}

describe("placePanel", () => {
	it("keeps the gap from the window's right edge by the panel's full width while it is still shrunk", () => {
		const panel = growingPanel();
		placePanel(panel, new DOMRect(232, 100, 153, 40), 12, 844, 390);
		expect(panel.style.left).toBe("128px");
	});

	it("puts the panel over the card when its full height would not fit below", () => {
		const panel = growingPanel();
		placePanel(panel, new DOMRect(10, 520, 170, 40), 12, 844, 390);
		expect(panel.classList.contains("is-above")).toBe(true);
	});
});

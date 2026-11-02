// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { type MenuRoom, placePanel } from "../../src/ui/menu/MenuPanel";

/** A panel 250 × 300 in layout, drawn smaller on screen while it grows in from scale(0.94). */
function growingPanel(height = 300): HTMLElement {
	const panel = document.createElement("div");
	Object.defineProperty(panel, "offsetWidth", { value: 250 });
	Object.defineProperty(panel, "offsetHeight", { value: height, writable: true });
	panel.getBoundingClientRect = () => new DOMRect(0, 0, 235, 282);
	return panel;
}

/** A phone 390 × 844: 59 px of status bar on top, 34 of home indicator below, a margin of 10. */
const PHONE: MenuRoom = { top: 69, bottom: 800, right: 390, windowHeight: 844 };

describe("placePanel", () => {
	it("keeps the gap from the window's right edge by the panel's full width while it is still shrunk", () => {
		const panel = growingPanel();
		placePanel(panel, new DOMRect(232, 100, 153, 40), 12, PHONE);
		expect(panel.style.left).toBe("128px");
	});

	it("puts the panel under the card when it fits there", () => {
		const panel = growingPanel();
		expect(placePanel(panel, new DOMRect(10, 200, 170, 40), 12, PHONE)).toBe(0);
		expect(panel.classList.contains("is-above")).toBe(false);
		expect(panel.style.getPropertyValue("--tc-panel-y")).toBe("240px");
	});

	it("puts the panel over the card when its full height would not fit below", () => {
		const panel = growingPanel();
		expect(placePanel(panel, new DOMRect(10, 520, 170, 40), 12, PHONE)).toBe(0);
		expect(panel.classList.contains("is-above")).toBe(true);
	});

	it("raises the card when the panel fits on neither side, the panel whole under it inside the room", () => {
		const panel = growingPanel(600);
		const raise = placePanel(panel, new DOMRect(10, 400, 300, 40), 12, PHONE);
		expect(raise).toBe(252);
		expect(panel.classList.contains("is-above")).toBe(false);
		expect(panel.classList.contains("is-scrolled")).toBe(false);
		expect(400 - raise + 40 + 12 + 600).toBe(PHONE.bottom);
		expect(400 - raise).toBeGreaterThanOrEqual(PHONE.top);
	});

	it("never raises the card past the room's top, and scrolls the panel that still doesn't fit", () => {
		const panel = growingPanel(800);
		const raise = placePanel(panel, new DOMRect(10, 400, 300, 40), 12, PHONE);
		expect(raise).toBe(400 - PHONE.top);
		expect(panel.classList.contains("is-scrolled")).toBe(true);
		expect(panel.style.maxHeight).toBe(`${PHONE.bottom - (PHONE.top + 40) - 12}px`);
	});

	it("leaves a panel that fits without a scroll or a height cap after one that didn't", () => {
		const tall = growingPanel(800);
		placePanel(tall, new DOMRect(10, 400, 300, 40), 12, PHONE);
		Object.assign(tall, { offsetHeight: 200 });
		placePanel(tall, new DOMRect(10, 400, 300, 40), 12, PHONE);
		expect(tall.classList.contains("is-scrolled")).toBe(false);
		expect(tall.style.maxHeight).toBe("");
	});
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { groupsAbove, type MenuRoom, placePanel } from "../../src/ui/menu/MenuPanel";

/** A panel 250 wide of groups this tall in layout, drawn smaller on screen while it grows in from scale(0.94). */
function growingPanel(heights: readonly number[] = [300]): HTMLElement {
	const panel = document.createElement("div");
	let top = 0;
	for (const height of heights) {
		const group = panel.appendChild(document.createElement("div"));
		Object.defineProperty(group, "offsetTop", { value: top });
		top += height;
	}
	Object.defineProperty(panel, "offsetWidth", { value: 250 });
	Object.defineProperty(panel, "offsetHeight", { get: () => [...panel.children].reduce((sum, group) => sum + heights[[...group.parentElement!.children].indexOf(group)], 0) });
	panel.getBoundingClientRect = () => new DOMRect(0, 0, 235, 282);
	return panel;
}

/** A phone 390 × 844: 59 px of status bar on top, 34 of home indicator below, a margin of 10. */
const PHONE: MenuRoom = { top: 69, bottom: 800, right: 390, windowHeight: 844 };

describe("groupsAbove", () => {
	const cuts = [100, 200, 350];
	const total = 450;

	it("keeps the panel whole under the anchor when it fits there", () => {
		expect(groupsAbove(cuts, total, 0, 450, true)).toBe(0);
	});

	it("puts it whole over the anchor when it fits there and not under", () => {
		expect(groupsAbove(cuts, total, 500, 100, true)).toBe(4);
	});

	it("splits it with the fewest groups over the anchor when it fits on neither side", () => {
		expect(groupsAbove(cuts, total, 300, 300, true)).toBe(2);
		expect(groupsAbove(cuts, total, 120, 350, true)).toBe(1);
		expect(groupsAbove(cuts, total, 360, 100, true)).toBe(3);
	});

	it("takes the way that leaves the least to scroll when no way fits", () => {
		expect(groupsAbove(cuts, total, 150, 150, true)).toBe(2);
	});

	it("never splits a panel that can't: the side that leaves less to scroll", () => {
		expect(groupsAbove(cuts, total, 300, 200, false)).toBe(4);
		expect(groupsAbove(cuts, total, 200, 300, false)).toBe(0);
	});
});

describe("placePanel", () => {
	it("keeps the gap from the window's right edge by the panel's full width while it is still shrunk", () => {
		const panel = growingPanel();
		placePanel(panel, new DOMRect(232, 100, 153, 40), 12, PHONE);
		expect(panel.style.left).toBe("128px");
	});

	it("puts the panel under the card when it fits there", () => {
		const panel = growingPanel();
		placePanel(panel, new DOMRect(10, 200, 170, 40), 12, PHONE);
		expect(panel.classList.contains("is-above")).toBe(false);
		expect(panel.style.getPropertyValue("--tc-panel-y")).toBe("240px");
	});

	it("puts the panel over the card when its full height would not fit below", () => {
		const panel = growingPanel();
		placePanel(panel, new DOMRect(10, 520, 170, 40), 12, PHONE);
		expect(panel.classList.contains("is-above")).toBe(true);
		expect(panel.style.getPropertyValue("--tc-panel-y")).toBe("324px");
	});

	it("splits a panel too tall for either side: its first groups over the card, the rest under it, the card where it was", () => {
		const panel = growingPanel([130, 130, 120, 110]);
		const upper = document.createElement("div");
		const groups = [...panel.children];
		placePanel(panel, new DOMRect(10, 400, 300, 40), 12, PHONE, upper);
		expect(upper.hidden).toBe(false);
		expect([...upper.children]).toEqual(groups.slice(0, 2));
		expect([...panel.children]).toEqual(groups.slice(2));
		expect(upper.classList.contains("is-above")).toBe(true);
		expect(upper.style.getPropertyValue("--tc-panel-y")).toBe("444px");
		expect(panel.classList.contains("is-above")).toBe(false);
		expect(panel.style.getPropertyValue("--tc-panel-y")).toBe("440px");
	});

	it("gathers the groups back when the panel fits whole again", () => {
		const panel = growingPanel([130, 130, 120, 110]);
		const upper = document.createElement("div");
		const groups = [...panel.children];
		placePanel(panel, new DOMRect(10, 400, 300, 40), 12, PHONE, upper);
		placePanel(panel, new DOMRect(10, 100, 300, 40), 12, PHONE, upper);
		expect(upper.hidden).toBe(true);
		expect([...panel.children]).toEqual(groups);
	});

	it("scrolls a panel that fits nowhere and can't split, and drops the scroll once it fits", () => {
		const panel = growingPanel([800]);
		placePanel(panel, new DOMRect(10, 400, 300, 40), 12, PHONE);
		expect(panel.classList.contains("is-scrolled")).toBe(true);
		expect(panel.style.maxHeight).toBe(`${PHONE.bottom - 440 - 12}px`);
		const small = growingPanel([200]);
		placePanel(small, new DOMRect(10, 400, 300, 40), 12, PHONE);
		expect(small.classList.contains("is-scrolled")).toBe(false);
		expect(small.style.maxHeight).toBe("");
	});
});

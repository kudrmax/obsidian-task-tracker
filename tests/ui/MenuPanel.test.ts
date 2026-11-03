// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { backRow, groupsAbove, menuRow, type MenuRoom, placePanel } from "../../src/ui/menu/MenuPanel";

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

	it("keeps the groups over the card as they stood when told to, though the panel would now fit whole under it", () => {
		const panel = growingPanel([130, 130, 120, 110]);
		const upper = document.createElement("div");
		const groups = [...panel.children];
		placePanel(panel, new DOMRect(10, 100, 300, 40), 12, PHONE, upper, 1);
		expect([...upper.children]).toEqual(groups.slice(0, 1));
		expect([...panel.children]).toEqual(groups.slice(1));
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

describe("menuRow", () => {
	const shape = (row: HTMLElement) => [...row.childNodes].map((node) => (node instanceof Element ? `${node.tagName.toLowerCase()}${node.className && typeof node.className === "string" ? `.${node.className}` : ""}` : "#text"));

	it("a tall row apart that adds: its kinds as classes, the label then the icon", () => {
		const row = menuRow(document.body, { label: "New section", icon: "plus", size: "tall", apart: true, add: true, onPick: () => undefined });
		expect(row.className).toBe("tc-btn tc-menu-row is-tall is-apart is-add");
		expect(shape(row)).toEqual(["span.tc-menu-label", "svg"]);
	});

	it("a quiet choice", () => {
		const row = menuRow(document.body, { label: "No section", choice: true, quiet: true, onPick: () => undefined });
		expect(row.className).toBe("tc-btn tc-menu-row is-choice is-quiet");
	});

	it("a purpose class after the kinds, danger last", () => {
		expect(menuRow(document.body, { label: "Remove due date", icon: "removeDue", cls: "tc-picker-remove", onPick: () => undefined }).className).toBe("tc-btn tc-menu-row tc-picker-remove");
		expect(menuRow(document.body, { label: "Delete", danger: true, size: "tall", apart: true, onPick: () => undefined }).className).toBe("tc-btn tc-menu-row is-tall is-apart is-danger");
	});

	it("the back row: its own root, the icon first, the title as text", () => {
		const row = backRow(document.body, "Section", () => undefined);
		expect(row.className).toBe("tc-btn tc-menu-back");
		expect(shape(row)).toEqual(["svg", "#text"]);
		expect(row.textContent).toBe("Section");
	});

	it("Refresh now: the icon at the start, on its own root", () => {
		const row = menuRow(document.body, { label: "Refresh now", icon: "refresh", root: "tc-source-refresh", iconSide: "start", onPick: () => undefined });
		expect(row.className).toBe("tc-btn tc-source-refresh");
		expect(shape(row)).toEqual(["svg", "#text"]);
	});

	it("a pick calls back", () => {
		let picked = 0;
		menuRow(document.body, { label: "Rename", onPick: () => picked++ }).click();
		expect(picked).toBe(1);
	});
});

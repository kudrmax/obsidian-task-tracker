// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ChromeClearance, navigationClear, statusClear } from "../../src/ui/chrome";

const VIEW = new DOMRect(344, 78, 856, 722);

describe("Obsidian's chrome over the view", () => {
	it("the phone navigation: from the view's bottom up to its top, none while hidden", () => {
		expect(navigationClear(new DOMRect(0, 0, 390, 844), new DOMRect(37, 760, 316, 52))).toBe(84);
		expect(navigationClear(new DOMRect(0, 0, 390, 844), new DOMRect(0, 0, 0, 0))).toBe(0);
		expect(navigationClear(VIEW, null)).toBe(0);
	});

	it("the desktop status bar: from the view's right edge in to its left, when it lies over the view", () => {
		expect(statusClear(VIEW, new DOMRect(1163, 775, 37, 25))).toBe(37);
		expect(statusClear(VIEW, new DOMRect(1163, 805, 37, 25))).toBe(0);
		expect(statusClear(VIEW, new DOMRect(0, 0, 0, 0))).toBe(0);
		expect(statusClear(VIEW, null)).toBe(0);
	});

	it("the navigation measured anew when it ends a move, as when it comes back from under the keyboard after the resize", () => {
		const view = document.body.appendChild(document.createElement("div"));
		const navbar = document.body.appendChild(document.createElement("div"));
		navbar.className = "mobile-navbar";
		const other = document.body.appendChild(document.createElement("div"));
		view.getBoundingClientRect = () => new DOMRect(0, 111, 390, 733);
		let navbarBox = new DOMRect(37, 1135, 316, 52);
		navbar.getBoundingClientRect = () => navbarBox;
		const clearance = new ChromeClearance(view);
		clearance.follow((type, handler) => document.addEventListener(type, handler));
		const clear = () => view.style.getPropertyValue("--tc-nav-clear");

		clearance.measure();
		expect(clear()).toBe("0px");
		navbarBox = new DOMRect(37, 760, 316, 52);
		other.dispatchEvent(new Event("transitionend", { bubbles: true }));
		expect(clear()).toBe("0px");
		navbar.dispatchEvent(new Event("transitionend", { bubbles: true }));
		expect(clear()).toBe("84px");
	});
});
